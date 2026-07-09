import JSZip from 'jszip'
import type { WordDocumentContent } from '../shared/documentModel'
import { assertLoadableDocument } from '../shared/validateDocument'
import { ODF_NAMESPACES, parseXmlDocument } from './xmlUtil'

interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

interface RunStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  highlight?: string
}

interface ParsedStyles {
  textStyles: Map<string, RunStyle>
  paragraphAligns: Map<string, string>
  /** Styles (family "paragraph") carrying a manual page break: fo:break-before="page"
   * and/or fo:break-after="page" — both occur in real LibreOffice files
   * (seitenumbruch-req.md §0.10/§3.7, fixture pagebreaks.odt). */
  paragraphBreaks: Map<string, { before: boolean; after: boolean }>
  /** Per LIST LEVEL (1-based `text:level`), not per style: one `text:list-style` may mix
   * `list-level-style-bullet` and `-number` across its levels — the previous
   * "has ANY number level → whole style is ordered" read forced every level of such a
   * foreign file onto one kind (liste-einruecken-tab-req.md Befund C Zeile 3). */
  listKinds: Map<string, Map<number, 'bullet' | 'ordered'>>
}

function childElements(el: Element, ns: string, localName: string): Element[] {
  return Array.from(el.children).filter((child) => child.namespaceURI === ns && child.localName === localName)
}

function firstChildNS(el: Element, ns: string, localName: string): Element | null {
  return childElements(el, ns, localName)[0] ?? null
}

function parseAutomaticStyles(automaticStylesEl: Element | null): ParsedStyles {
  const textStyles = new Map<string, RunStyle>()
  const paragraphAligns = new Map<string, string>()
  const paragraphBreaks = new Map<string, { before: boolean; after: boolean }>()
  const listKinds = new Map<string, Map<number, 'bullet' | 'ordered'>>()
  if (!automaticStylesEl) return { textStyles, paragraphAligns, paragraphBreaks, listKinds }

  for (const styleEl of childElements(automaticStylesEl, ODF_NAMESPACES.style, 'style')) {
    const name = styleEl.getAttributeNS(ODF_NAMESPACES.style, 'name')
    const family = styleEl.getAttributeNS(ODF_NAMESPACES.style, 'family')
    if (!name) continue

    if (family === 'text') {
      const props = firstChildNS(styleEl, ODF_NAMESPACES.style, 'text-properties')
      if (!props) continue
      const style: RunStyle = {}
      if (props.getAttributeNS(ODF_NAMESPACES.fo, 'font-weight') === 'bold') style.bold = true
      if (props.getAttributeNS(ODF_NAMESPACES.fo, 'font-style') === 'italic') style.italic = true
      const underline = props.getAttributeNS(ODF_NAMESPACES.style, 'text-underline-style')
      if (underline && underline !== 'none') style.underline = true
      const strike = props.getAttributeNS(ODF_NAMESPACES.style, 'text-line-through-style')
      if (strike && strike !== 'none') style.strike = true
      const color = props.getAttributeNS(ODF_NAMESPACES.fo, 'color')
      if (color) style.color = color
      const bg = props.getAttributeNS(ODF_NAMESPACES.fo, 'background-color')
      if (bg) style.highlight = bg
      textStyles.set(name, style)
    } else if (family === 'paragraph') {
      const props = firstChildNS(styleEl, ODF_NAMESPACES.style, 'paragraph-properties')
      const align = props?.getAttributeNS(ODF_NAMESPACES.fo, 'text-align')
      if (align) paragraphAligns.set(name, align)
      // Manual page breaks live on the paragraph style (LibreOffice's own encoding).
      // `text:soft-page-break` elements are deliberately NOT read here or anywhere —
      // they are a pure rendering hint for an AUTOMATIC break, not a manual one
      // (seitenumbruch-req.md §3.7, fixture text-extract.odt).
      const before = props?.getAttributeNS(ODF_NAMESPACES.fo, 'break-before') === 'page'
      const after = props?.getAttributeNS(ODF_NAMESPACES.fo, 'break-after') === 'page'
      if (before || after) paragraphBreaks.set(name, { before, after })
    }
  }

  for (const listStyleEl of childElements(automaticStylesEl, ODF_NAMESPACES.text, 'list-style')) {
    const name = listStyleEl.getAttributeNS(ODF_NAMESPACES.style, 'name')
    if (!name) continue
    const levels = new Map<number, 'bullet' | 'ordered'>()
    for (const levelEl of Array.from(listStyleEl.children)) {
      if (levelEl.namespaceURI !== ODF_NAMESPACES.text) continue
      const isNumber = levelEl.localName === 'list-level-style-number'
      const isBullet = levelEl.localName === 'list-level-style-bullet' || levelEl.localName === 'list-level-style-image'
      if (!isNumber && !isBullet) continue
      const level = Number(levelEl.getAttributeNS(ODF_NAMESPACES.text, 'level') ?? '1') || 1
      levels.set(level, isNumber ? 'ordered' : 'bullet')
    }
    listKinds.set(name, levels)
  }

  return { textStyles, paragraphAligns, paragraphBreaks, listKinds }
}

const EMPTY_REDLINE_MARKER_NAMES = new Set([
  'change',
  'change-start',
  'change-end',
  'bookmark',
  'bookmark-start',
  'bookmark-end',
])

function isEmptyRedlineMarker(el: Element): boolean {
  return el.namespaceURI === ODF_NAMESPACES.text && EMPTY_REDLINE_MARKER_NAMES.has(el.localName)
}

function emptyParagraph(): JsonNode {
  return { type: 'paragraph', attrs: { align: 'left' } }
}

function decodeInline(pEl: Element, styles: ParsedStyles): JsonNode[] {
  const result: JsonNode[] = []

  function marksFor(styleName: string | null): Array<{ type: string; attrs?: Record<string, unknown> }> {
    if (!styleName) return []
    const style = styles.textStyles.get(styleName)
    if (!style) return []
    const marks: Array<{ type: string; attrs?: Record<string, unknown> }> = []
    if (style.bold) marks.push({ type: 'strong' })
    if (style.italic) marks.push({ type: 'em' })
    if (style.underline) marks.push({ type: 'underline' })
    if (style.strike) marks.push({ type: 'strike' })
    if (style.color) marks.push({ type: 'textColor', attrs: { color: style.color } })
    if (style.highlight) marks.push({ type: 'highlight', attrs: { color: style.highlight } })
    return marks
  }

  /**
   * Combines the marks inherited from an ancestor `text:span` with the marks of a
   * nested one. A ProseMirror text node's marks must contain each mark *type* at most
   * once (`Node.check()` enforces this) — but real-world ODT files nest spans whose
   * styles re-apply the same property (e.g. a template style redundantly repeating
   * `font-weight: bold` on an inner span already made bold by an outer one), which
   * without de-duplication produced `marks: [strong, strong, em]` and made every
   * subsequently loaded document fail `assertLoadableDocument` (see e.g. the
   * `multiple-paragraphs-and-spans.odt`/`indentTest.odt` fixtures). The innermost
   * (most specific) mark for a given type wins.
   */
  function mergeMarks(
    outer: Array<{ type: string; attrs?: Record<string, unknown> }>,
    inner: Array<{ type: string; attrs?: Record<string, unknown> }>,
  ): Array<{ type: string; attrs?: Record<string, unknown> }> {
    const merged = [...outer]
    for (const mark of inner) {
      const existingIndex = merged.findIndex((m) => m.type === mark.type)
      if (existingIndex >= 0) merged[existingIndex] = mark
      else merged.push(mark)
    }
    return merged
  }

  function walk(node: ChildNode, marks: Array<{ type: string; attrs?: Record<string, unknown> }>) {
    if (node.nodeType === node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) result.push({ type: 'text', text, marks: marks.length ? marks : undefined })
      return
    }
    if (node.nodeType !== node.ELEMENT_NODE) return
    const el = node as Element
    if (el.namespaceURI === ODF_NAMESPACES.text && el.localName === 'span') {
      const styleName = el.getAttributeNS(ODF_NAMESPACES.text, 'style-name')
      const childMarks = mergeMarks(marks, marksFor(styleName))
      for (const child of Array.from(el.childNodes)) walk(child, childMarks)
    } else if (el.namespaceURI === ODF_NAMESPACES.text && el.localName === 'line-break') {
      result.push({ type: 'hard_break' })
    } else if (el.namespaceURI === ODF_NAMESPACES.text && el.localName === 's') {
      const count = Number(el.getAttributeNS(ODF_NAMESPACES.text, 'c') ?? '1') || 1
      result.push({ type: 'text', text: ' '.repeat(count), marks: marks.length ? marks : undefined })
    } else if (el.namespaceURI === ODF_NAMESPACES.text && el.localName === 'tab') {
      result.push({ type: 'text', text: '\t', marks: marks.length ? marks : undefined })
    } else if (isEmptyRedlineMarker(el)) {
      // Redline/bookmark markers carry no textual content of their own — nothing to
      // descend into, listed separately purely for documentation clarity.
    } else {
      // Any other inline element (hyperlink `text:a`, `text:placeholder`,
      // `text:date`/`text:page-number`/`text:page-count`/`text:author-name`, a
      // footnote's `text:note`, ...) is not individually interpreted, but its visible
      // text must not be silently dropped — descend into its children with the same
      // marks instead of stopping here (see datei-oeffnen-req.md §3.13).
      for (const child of Array.from(el.childNodes)) walk(child, marks)
    }
  }

  for (const child of Array.from(pEl.childNodes)) walk(child, [])
  return result
}

/** A `<text:p>` may hold plain text, image/textbox/object frames, or both — split it into block nodes. */
function paragraphToBlocks(pEl: Element, styles: ParsedStyles, depth = 0): JsonNode[] {
  const frames = childElements(pEl, ODF_NAMESPACES.draw, 'frame')
  const styleName = pEl.getAttributeNS(ODF_NAMESPACES.text, 'style-name')
  const align = (styleName && styles.paragraphAligns.get(styleName)) || 'left'

  if (frames.length === 0) {
    const content = decodeInline(pEl, styles)
    // Mirror ProseMirror's own Node.toJSON(), which omits `content` entirely for an
    // empty fragment rather than emitting `content: []` — otherwise a freshly created
    // blank document and the same document after an export/import round trip would be
    // structurally different (`toEqual`) despite ProseMirror treating them as the same
    // node. See createBlankWordDocument()/emptyDocJSON() in documentModel.ts.
    return [content.length > 0 ? { type: 'paragraph', attrs: { align }, content } : { type: 'paragraph', attrs: { align } }]
  }

  const blocks: JsonNode[] = []
  let textBuffer: ChildNode[] = []

  const flushText = () => {
    if (textBuffer.length === 0) return
    const wrapper = pEl.ownerDocument.createElementNS(ODF_NAMESPACES.text, 'text:p')
    for (const node of textBuffer) wrapper.appendChild(node.cloneNode(true))
    const inline = decodeInline(wrapper, styles)
    if (inline.length > 0) blocks.push({ type: 'paragraph', attrs: { align }, content: inline })
    textBuffer = []
  }

  for (const child of Array.from(pEl.childNodes)) {
    if (child.nodeType === child.ELEMENT_NODE && (child as Element).localName === 'frame' && (child as Element).namespaceURI === ODF_NAMESPACES.draw) {
      flushText()
      blocks.push(...frameToBlocks(child as Element, styles, depth))
    } else {
      textBuffer.push(child)
    }
  }
  flushText()

  return blocks
}

// Guards against pathologically deep nesting (lists-in-lists, tables-in-tables,
// textbox-in-textbox) in real-world files, which otherwise either blow the call stack
// or make import take far too long. Past this depth we stop descending further.
const MAX_NESTING_DEPTH = 25

/**
 * Decides what a `<draw:frame>` represents:
 * - an actual image (`draw:image` child present) → an `image` node, as before.
 * - otherwise a textbox (`draw:text-box` child present) → its contents are kept as an
 *   `unsupported_block` so the visible text survives instead of turning into a
 *   blank/empty image node (datei-oeffnen-req.md §3.13, "draw:frame-Textbox").
 * - otherwise (a chart/OLE object with no extractable text) → an opaque
 *   `unsupported_block` placeholder, still visible rather than vanishing.
 *
 * Also used directly from `elementToBlocks` for page-anchored frames, which may
 * appear as a direct child of `office:text` (not nested inside a `text:p`).
 */
// ODF lengths carry an explicit unit (svg:width="12cm"). Convert to CSS px at 96 dpi so
// an imported image keeps its real size instead of falling back to a default on export.
const PX_PER_UNIT: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 96 / 6,
}
export function odfLengthToPx(value: string | null): number | null {
  if (!value) return null
  const m = /^\s*([\d.]+)\s*(px|in|cm|mm|pt|pc)\s*$/.exec(value)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * PX_PER_UNIT[m[2]])
}

function frameToBlocks(frameEl: Element, styles: ParsedStyles, depth: number): JsonNode[] {
  const imageEl = firstChildNS(frameEl, ODF_NAMESPACES.draw, 'image')
  if (imageEl) {
    const href = imageEl.getAttributeNS(ODF_NAMESPACES.xlink, 'href') ?? ''
    const alt = frameEl.getAttributeNS(ODF_NAMESPACES.draw, 'name') ?? ''
    const width = odfLengthToPx(frameEl.getAttributeNS(ODF_NAMESPACES.svg, 'width'))
    const height = odfLengthToPx(frameEl.getAttributeNS(ODF_NAMESPACES.svg, 'height'))
    // the size read from the file is this image's "original" for reset-to-original
    return [{ type: 'image', attrs: { src: href, alt, width, height, naturalWidth: width, naturalHeight: height } }]
  }

  const textBoxEl = firstChildNS(frameEl, ODF_NAMESPACES.draw, 'text-box')
  if (textBoxEl) {
    if (depth >= MAX_NESTING_DEPTH) return [{ type: 'unsupported_block', attrs: { kind: 'object' }, content: [emptyParagraph()] }]
    const content = Array.from(textBoxEl.children).flatMap((child) => elementToBlocks(child, styles, depth + 1))
    return [{ type: 'unsupported_block', attrs: { kind: 'textbox' }, content: content.length ? content : [emptyParagraph()] }]
  }

  return [{ type: 'unsupported_block', attrs: { kind: 'object' }, content: [emptyParagraph()] }]
}

/** List context threaded through nested `text:list` recursion: a nested list very often
 * carries NO own `text:style-name` and inherits the outer list's style — and its list
 * LEVEL (1-based) decides which `list-level-style-*` of that style applies. */
interface ListContext {
  styleName: string | null
  level: number
}

/** The kind for one concrete (style, level): the level's own entry, else level 1 (deep
 * levels of sparsely defined styles), else 'bullet' (previous default for unknown styles). */
function listKindFor(styles: ParsedStyles, styleName: string | null, level: number): 'bullet' | 'ordered' {
  const levels = styleName ? styles.listKinds.get(styleName) : undefined
  if (!levels) return 'bullet'
  return levels.get(level) ?? levels.get(1) ?? 'bullet'
}

function elementToBlocks(el: Element, styles: ParsedStyles, depth = 0, listCtx?: ListContext): JsonNode[] {
  const ns = el.namespaceURI
  const local = el.localName

  if (ns === ODF_NAMESPACES.text && local === 'p') return paragraphToBlocks(el, styles, depth)

  if (ns === ODF_NAMESPACES.text && local === 'h') {
    const level = Number(el.getAttributeNS(ODF_NAMESPACES.text, 'outline-level') ?? '1') || 1
    const styleName = el.getAttributeNS(ODF_NAMESPACES.text, 'style-name')
    const align = (styleName && styles.paragraphAligns.get(styleName)) || 'left'
    const content = decodeInline(el, styles)
    return [content.length > 0 ? { type: 'heading', attrs: { level, align }, content } : { type: 'heading', attrs: { level, align } }]
  }

  if (depth >= MAX_NESTING_DEPTH) return []

  // `<text:section>` is ODF's mechanism for a multi-column (or otherwise
  // page-layout-varying) region of body text (datei-oeffnen-req.md §3.13,
  // "mehrspaltiges Layout") — real-world newsletter-/report-style documents wrap a
  // run of paragraphs/lists/tables in a section whose style carries
  // `style:section-properties > style:columns`. It is a semantic *wrapper*, not a
  // block type in its own right, and previously fell through to the default `return
  // []` below — silently dropping every paragraph inside it. The column layout itself
  // is not reproduced (paragraphs render as a single simplified column, which the
  // requirement explicitly allows: "Spalten dürfen vereinfacht dargestellt werden"),
  // but the text must not vanish, so its children are unwrapped in place instead.
  if (ns === ODF_NAMESPACES.text && local === 'section') {
    return Array.from(el.children).flatMap((child) => elementToBlocks(child, styles, depth + 1))
  }

  // A `draw:frame` may legally appear as a direct child of `office:text` (e.g. a
  // page-anchored textbox/image, `text:anchor-type="page"`), not just nested inside a
  // `text:p` — without this, such a frame (and any text inside it) was silently
  // dropped entirely (datei-oeffnen-code.md §5, "Bug B").
  if (ns === ODF_NAMESPACES.draw && local === 'frame') return frameToBlocks(el, styles, depth)

  if (ns === ODF_NAMESPACES.text && local === 'list') {
    // A nested list without its own style-name inherits the enclosing list's style;
    // the 1-based list level picks the matching `list-level-style-*` entry.
    const styleName = el.getAttributeNS(ODF_NAMESPACES.text, 'style-name') ?? listCtx?.styleName ?? null
    const level = (listCtx?.level ?? 0) + 1
    const kind = listKindFor(styles, styleName, level)
    const items = childElements(el, ODF_NAMESPACES.text, 'list-item').map((itemEl) => {
      const content = Array.from(itemEl.children).flatMap((child) =>
        elementToBlocks(child, styles, depth + 1, { styleName, level }),
      )
      // A list item can legally hold nothing but e.g. a soft-page-break, which
      // `elementToBlocks` deliberately drops — `list_item`'s `block+` content model
      // still needs at least one block, so fall back to an empty paragraph rather
      // than producing an invalid, uncheckable node (see `imageWithinList.odt`-style
      // fixtures for the analogous nested-list case this guards against).
      return { type: 'list_item', content: content.length ? content : [emptyParagraph()] }
    })
    return [{ type: kind === 'ordered' ? 'ordered_list' : 'bullet_list', content: items }]
  }

  if (ns === ODF_NAMESPACES.table && local === 'table') {
    const rows = childElements(el, ODF_NAMESPACES.table, 'table-row').map((rowEl) => ({
      type: 'table_row',
      content: childElements(rowEl, ODF_NAMESPACES.table, 'table-cell').map((cellEl) => {
        const colspan = Number(cellEl.getAttributeNS(ODF_NAMESPACES.table, 'number-columns-spanned') ?? '1') || 1
        const rowspan = Number(cellEl.getAttributeNS(ODF_NAMESPACES.table, 'number-rows-spanned') ?? '1') || 1
        const content = Array.from(cellEl.children).flatMap((child) => elementToBlocks(child, styles, depth + 1))
        return {
          type: 'table_cell',
          // A real-world table cell can be entirely empty (`<table:table-cell/>`, no
          // `text:p` at all — seen e.g. in the `TableWidth.odt`/`lostBackground.odt`
          // fixtures). `table_cell`'s content model requires at least one block, so
          // fall back to an empty paragraph instead of producing invalid, uncheckable
          // content.
          attrs: { colspan, rowspan, colwidth: null },
          content: content.length ? content : [emptyParagraph()],
        }
      }),
    }))
    return [{ type: 'table', content: rows }]
  }

  return []
}

async function resolveImageSources(
  zip: JSZip,
  blocks: JsonNode[],
): Promise<void> {
  const tasks: Promise<void>[] = []
  const visit = (node: JsonNode) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      const href = node.attrs.src as string
      const entry = zip.file(href)
      if (entry) {
        tasks.push(
          entry.async('base64').then((base64) => {
            const ext = href.split('.').pop()?.toLowerCase() ?? 'png'
            const mime = ext === 'jpg' ? 'jpeg' : ext
            node.attrs = { ...node.attrs, src: `data:image/${mime};base64,${base64}` }
          }),
        )
      }
    }
    node.content?.forEach(visit)
  }
  blocks.forEach(visit)
  await Promise.all(tasks)
}

async function readOfficeTextChildren(bodyTextEl: Element, styles: ParsedStyles, zip: JSZip): Promise<JsonNode[]> {
  // Manual page breaks (fo:break-before/-after="page" on the paragraph style) are
  // translated into top-level page_break nodes here — and ONLY here: a break style on a
  // paragraph nested inside a table cell is deliberately not translated, matching how
  // LibreOffice itself renders such files (LO bug 35585; real fixtures
  // no_pagebreak.odt / 35585_-_no_pagebreak.odt — seitenumbruch-req.md Grenzfall 4).
  const blocks: JsonNode[] = []
  for (const child of Array.from(bodyTextEl.children)) {
    const isParagraphLike =
      child.namespaceURI === ODF_NAMESPACES.text && (child.localName === 'p' || child.localName === 'h')
    const styleName = isParagraphLike ? child.getAttributeNS(ODF_NAMESPACES.text, 'style-name') : null
    const breaks = (styleName && styles.paragraphBreaks.get(styleName)) || { before: false, after: false }
    const childBlocks = elementToBlocks(child, styles)
    if (breaks.before) {
      blocks.push({ type: 'page_break' })
      // An EMPTY paragraph whose style only carries the break is a pure break carrier
      // (our own writer emits exactly that before tables/lists/images and at the doc
      // end; LibreOffice produces the same shape for Ctrl+Enter on an empty line) —
      // collapse it to the bare page_break instead of leaving a stray empty paragraph
      // at the top of the new page (seitenumbruch-req.md §3.6, Grenzfall 10).
      const isEmptyCarrier =
        childBlocks.length === 1 && childBlocks[0].type === 'paragraph' && !childBlocks[0].content?.length
      if (!isEmptyCarrier) blocks.push(...childBlocks)
    } else {
      blocks.push(...childBlocks)
    }
    if (breaks.after) blocks.push({ type: 'page_break' })
  }
  // A document ending on a break gets a caret home on the new page — same
  // normalisation as the insertPageBreak command (Grenzfall 2).
  if (blocks[blocks.length - 1]?.type === 'page_break') blocks.push(emptyParagraph())
  await resolveImageSources(zip, blocks)
  return blocks
}

export async function readOdt(file: File | Blob): Promise<WordDocumentContent> {
  const zip = await JSZip.loadAsync(file)

  const contentXmlText = await zip.file('content.xml')?.async('text')
  if (!contentXmlText) throw new Error('content.xml fehlt — keine gültige ODT-Datei.')
  const contentDoc = parseXmlDocument(contentXmlText)
  const contentAutomaticStyles = contentDoc.getElementsByTagNameNS(ODF_NAMESPACES.office, 'automatic-styles')[0] ?? null
  const contentStyles = parseAutomaticStyles(contentAutomaticStyles)
  const officeText = contentDoc.getElementsByTagNameNS(ODF_NAMESPACES.office, 'text')[0]
  const bodyBlocks = officeText ? await readOfficeTextChildren(officeText, contentStyles, zip) : []

  let headerBlocks: JsonNode[] | null = null
  let footerBlocks: JsonNode[] | null = null
  const stylesXmlText = await zip.file('styles.xml')?.async('text')
  if (stylesXmlText) {
    const stylesDoc = parseXmlDocument(stylesXmlText)
    const stylesAutomaticStyles = stylesDoc.getElementsByTagNameNS(ODF_NAMESPACES.office, 'automatic-styles')[0] ?? null
    const stylesForChrome = parseAutomaticStyles(stylesAutomaticStyles)
    const masterPage = stylesDoc.getElementsByTagNameNS(ODF_NAMESPACES.style, 'master-page')[0]
    if (masterPage) {
      const headerEl = firstChildNS(masterPage, ODF_NAMESPACES.style, 'header')
      const footerEl = firstChildNS(masterPage, ODF_NAMESPACES.style, 'footer')
      if (headerEl) {
        headerBlocks = Array.from(headerEl.children).flatMap((child) => elementToBlocks(child, stylesForChrome))
        await resolveImageSources(zip, headerBlocks)
      }
      if (footerEl) {
        footerBlocks = Array.from(footerEl.children).flatMap((child) => elementToBlocks(child, stylesForChrome))
        await resolveImageSources(zip, footerBlocks)
      }
    }
  }

  let title = ''
  const metaXmlText = await zip.file('meta.xml')?.async('text')
  if (metaXmlText) {
    const metaDoc = parseXmlDocument(metaXmlText)
    title = metaDoc.getElementsByTagNameNS(ODF_NAMESPACES.dc, 'title')[0]?.textContent ?? ''
  }

  // `doc`'s content model requires at least one block (`block+`) — a header/footer
  // element can legally exist but resolve to zero recognizable blocks, and an empty
  // array is still truthy, so `headerBlocks ? ... : null` alone doesn't catch it (see
  // the analogous DOCX fix in `docx/reader.ts` for the real fixtures that hit this).
  const result: WordDocumentContent = {
    body: { type: 'doc', content: bodyBlocks.length ? bodyBlocks : [emptyParagraph()] },
    header: headerBlocks ? { type: 'doc', content: headerBlocks.length ? headerBlocks : [emptyParagraph()] } : null,
    footer: footerBlocks ? { type: 'doc', content: footerBlocks.length ? footerBlocks : [emptyParagraph()] } : null,
    meta: { title },
  }
  assertLoadableDocument(result)
  return result
}
