import { Slice, Fragment } from 'prosemirror-model'
import type { ResolvedPos, Schema, Node as ProseMirrorNode } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { wordSchema } from '../schema'
import { imageFallbackText, isEmbeddableImageSrc } from '../imageFallback'

/**
 * The whole "Einfügen" (paste) / drop pipeline, bundled as one ProseMirror
 * plugin plus pure, independently unit-testable helpers. WordEditor.tsx only
 * wires in `createPastePlugin`, mirroring how `pagination.ts` exposes
 * `createPaginationPlugin`. See specs/einfuegen-req.md and einfuegen-code.md.
 *
 * Deliberately NO `navigator.clipboard` anywhere (privacy invariant enforced by
 * clipboard-privacy.test.ts): everything runs through the native paste/drop
 * DOM events via ProseMirror EditorProps. See einfuegen-code.md Abschnitt 1.
 */

/**
 * Pure: splits plain text into blocks (blank-line separated) of lines
 * (single-newline separated). `\r\n`/`\r` are normalised first; `\t` is left
 * untouched (Grenzfall 6). Independently unit-testable — no ProseMirror types.
 */
export function splitPlainTextIntoParagraphs(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.split('\n'))
}

/**
 * `clipboardTextParser`: builds the slice to insert for a plain-text paste
 * (einfuegen-req.md 3.3). A single block → pure inline content with an open
 * paragraph on both ends, so it merges into the surrounding paragraph rather
 * than starting a new one; each single newline within a block → `hard_break`.
 * Multiple blocks → multiple paragraphs.
 *
 * Every generated text node carries `$context.marks()` — the exact mechanism
 * ProseMirror's own default uses when no custom `clipboardTextParser` is
 * registered (`prosemirror-view` clipboard.ts: `schema.text(block, marks)`).
 * Registering our own parser suppresses that default entirely, so without this
 * the plain-text-inherits-surrounding-marks behaviour (Grenzfall 21) would
 * regress. In plain-paste mode (Strg+Umschalt+V, 3.7) these marks are removed
 * again afterwards by `stripToPlainText` — enriching first and stripping later
 * keeps both requirements in one place instead of deciding twice.
 */
export function plainTextClipboardParser(text: string, $context: ResolvedPos, schema: Schema): Slice {
  const marks = $context.marks()
  const paragraphs = splitPlainTextIntoParagraphs(text).map((lines) => {
    const inline: ProseMirrorNode[] = []
    lines.forEach((line, index) => {
      if (index > 0) inline.push(schema.nodes.hard_break.create())
      if (line.length > 0) inline.push(schema.text(line, marks))
    })
    return schema.nodes.paragraph.create(null, Fragment.fromArray(inline))
  })
  return new Slice(Fragment.fromArray(paragraphs), 1, 1)
}

/**
 * `transformPastedHTML`: neutralises active content BEFORE the schema-based
 * parse, rather than trusting the parseDOM whitelist alone (einfuegen-req.md
 * 3.11). Also replaces every `<img>` whose `src` is not embeddable with visible
 * placeholder text so the surrounding text survives and the export can never
 * abort (0.7/3.12).
 */
export function sanitizePastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')

  // 1. Drop elements that can carry active content / resources.
  parsed.querySelectorAll('script,style,meta,link,iframe,object,embed').forEach((el) => el.remove())

  // 2. Drop comment nodes (Office conditional comments <!--[if …]>…<![endif]-->,
  //    the mso-* "suppe") — they are inert in a detached document but removed
  //    for good measure.
  const comments: ChildNode[] = []
  const walker = parsed.createTreeWalker(parsed.documentElement, NodeFilter.SHOW_COMMENT)
  while (walker.nextNode()) comments.push(walker.currentNode as ChildNode)
  comments.forEach((comment) => comment.remove())

  // 3. Strip every on* handler attribute and any javascript: URL.
  parsed.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name)
      } else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })

  // 4. Replace non-embeddable images with placeholder text (surrounding text kept).
  parsed.querySelectorAll('img').forEach((img) => {
    if (!isEmbeddableImageSrc(img.getAttribute('src') ?? '')) {
      img.replaceWith(parsed.createTextNode(imageFallbackText(img.getAttribute('alt'))))
    }
  })

  return parsed.body.innerHTML
}

function mapFragment(fragment: Fragment, mapNode: (node: ProseMirrorNode) => ProseMirrorNode | null): Fragment {
  const out: ProseMirrorNode[] = []
  fragment.forEach((node) => {
    const replaced = mapNode(node)
    if (replaced) {
      out.push(replaced)
    } else if (node.content.size > 0) {
      out.push(node.copy(mapFragment(node.content, mapNode)))
    } else {
      out.push(node)
    }
  })
  return Fragment.fromArray(out)
}

/**
 * `transformPasted`: node-level defence-in-depth. Replaces every surviving
 * `image` node with a non-embeddable `src` by a `paragraph` holding placeholder
 * text (a `paragraph`, not a bare `text`, because `image` is `group:'block'`).
 * Covers the drop path and any future path that bypasses `sanitizePastedHtml`.
 */
export function sanitizePastedSlice(slice: Slice, schema: Schema): Slice {
  const content = mapFragment(slice.content, (node) => {
    if (node.type.name === 'image' && !isEmbeddableImageSrc(String(node.attrs.src ?? ''))) {
      return schema.nodes.paragraph.create(null, schema.text(imageFallbackText(node.attrs.alt as string | undefined)))
    }
    return null
  })
  return new Slice(content, slice.openStart, slice.openEnd)
}

/**
 * `transformPasted` in plain-paste mode (3.3/3.7): removes ALL marks and turns
 * every non-`paragraph` textblock (i.e. `heading`) into a `paragraph`. Block
 * structure otherwise (lists, tables) is preserved — only character formatting
 * and block *type* of headings change (einfuegen-req.md 3.7).
 */
export function stripToPlainText(slice: Slice, schema: Schema): Slice {
  const strip = (fragment: Fragment): Fragment => {
    const out: ProseMirrorNode[] = []
    fragment.forEach((node) => {
      if (node.isText) {
        out.push(node.mark([]))
      } else if (node.type.name === 'heading') {
        out.push(schema.nodes.paragraph.create(null, strip(node.content)))
      } else if (node.content.size > 0) {
        out.push(node.copy(strip(node.content)))
      } else {
        out.push(node)
      }
    })
    return Fragment.fromArray(out)
  }
  return new Slice(strip(slice.content), slice.openStart, slice.openEnd)
}

export interface PastePluginOptions {
  /** Visible, non-blocking feedback (einfuegen-req.md 3.9) — e.g. external image
   *  replaced by placeholder, image blob not decodable. */
  onNotice: (message: string) => void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(file)
  })
}

/**
 * Image blob (from a paste with no text/html, or a file drop) → data URL →
 * `image` node in ONE transaction (a single undo step, 3.8). `at` is captured
 * SYNCHRONOUSLY by the caller (before this async function's `await`), because the
 * user may type/click between trigger and the FileReader result — so the target
 * must not be re-read from `view.state.selection` at resolution time (Grenzfall
 * 9). `replaceRangeWith` (not `replaceSelectionWith`) targets that frozen range;
 * positions are clamped to the current doc so an intervening edit can never make
 * them out of range. Attrs match `commands.ts::insertImage` (default size).
 */
export async function insertImageFile(view: EditorView, file: File, at: { from: number; to: number }): Promise<void> {
  const dataUrl = await readFileAsDataUrl(file)
  const node = wordSchema.nodes.image.create({ src: dataUrl, alt: file.name ?? '' })
  const size = view.state.doc.content.size
  const from = Math.min(at.from, size)
  const to = Math.min(Math.max(at.to, from), size)
  view.dispatch(view.state.tr.replaceRangeWith(from, to, node).scrollIntoView())
}

/**
 * The plugin wired into WordEditor.tsx. Bundles the paste/drop sanitisers, the
 * image-blob path, and the plain-paste-mode flag (set by a non-consuming keydown
 * listener — Strg/Cmd+Umschalt+V, 3.3). The flag is a closure-local number, so
 * no content is ever persisted or logged.
 */
export function createPastePlugin(options: PastePluginOptions): Plugin {
  let plainPasteUntil = 0
  const plainModeActive = () => Date.now() < plainPasteUntil

  const NOTICE_EXTERNAL_IMAGE = 'Ein externes Bild wurde durch Platzhaltertext ersetzt (nicht einbettbar).'

  return new Plugin({
    props: {
      transformPastedHTML: (html) => {
        const clean = sanitizePastedHtml(html)
        // The only source of the "[Bild" placeholder in sanitized output is our
        // own non-embeddable-image replacement — so its presence means an
        // external image was dropped (einfuegen-req.md 3.9, visible feedback).
        if (clean.includes('[Bild')) options.onNotice(NOTICE_EXTERNAL_IMAGE)
        return clean
      },
      transformPasted: (slice) => {
        if (plainModeActive()) {
          plainPasteUntil = 0
          return stripToPlainText(slice, wordSchema)
        }
        // Drop path / any path that bypasses the HTML sanitiser: a non-embeddable
        // image node reaches the slice level. Notify before replacing it.
        let hasExternalImage = false
        slice.content.descendants((node) => {
          if (node.type.name === 'image' && !isEmbeddableImageSrc(String(node.attrs.src ?? ''))) {
            hasExternalImage = true
          }
        })
        if (hasExternalImage) options.onNotice(NOTICE_EXTERNAL_IMAGE)
        return sanitizePastedSlice(slice, wordSchema)
      },
      clipboardTextParser: (text, $context) => plainTextClipboardParser(text, $context, wordSchema),
      handleDOMEvents: {
        // Arms plain-paste mode without preventDefault — the native paste runs
        // normally (prosemirror-view already skips the HTML path for this combo,
        // see einfuegen-code.md 0.6 Punkt 3); this flag only drives the extra
        // mark/heading stripping in transformPasted above.
        keydown(_view, event) {
          if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'v' || event.key === 'V')) {
            plainPasteUntil = Date.now() + 1000
          }
          return false
        },
      },
      // 3.5: image-only clipboard (no text/html). Freeze the target range HERE,
      // synchronously, before the async FileReader inside insertImageFile.
      handlePaste(view, event) {
        const dt = event.clipboardData
        if (!dt || dt.types.includes('text/html')) return false
        const file = Array.from(dt.items)
          .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
          ?.getAsFile()
        if (!file) return false
        const { from, to } = view.state.selection
        insertImageFile(view, file, { from, to }).catch(() =>
          options.onNotice('Bild aus der Zwischenablage konnte nicht eingefügt werden.'),
        )
        return true
      },
      // 1 #6: plain file drop (text/HTML drops already flow through transformPasted[HTML]).
      handleDrop(view, event) {
        const dt = event.dataTransfer
        if (!dt || dt.files.length === 0 || dt.types.includes('text/html')) return false
        const file = Array.from(dt.files).find((f) => f.type.startsWith('image/'))
        if (!file) return false
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from
        insertImageFile(view, file, { from: at, to: at }).catch(() =>
          options.onNotice('Bild konnte nicht eingefügt werden.'),
        )
        return true
      },
    },
  })
}
