import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'

const alignAttr = { align: { default: 'left', validate: 'string' } }

/** Tooltip/screen-reader text shown on an `unsupported_block` placeholder, keyed by `attrs.kind`. */
export const UNSUPPORTED_KIND_LABEL: Record<string, string> = {
  textbox: 'Textfeld — vereinfacht dargestellt',
  object: 'Eingebettetes Objekt — nicht unterstützt',
  chart: 'Diagramm — nicht unterstützt',
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: alignAttr,
    parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ align: (dom as HTMLElement).style.textAlign || 'left' }) }],
    toDOM(node) {
      return ['p', { style: `text-align: ${node.attrs.align}` }, 0]
    },
  },

  heading: {
    group: 'block',
    content: 'inline*',
    attrs: { level: { default: 1, validate: 'number' }, ...alignAttr },
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      getAttrs: (dom) => ({ level, align: (dom as HTMLElement).style.textAlign || 'left' }),
    })),
    toDOM(node) {
      return [`h${node.attrs.level}`, { style: `text-align: ${node.attrs.align}` }, 0]
    },
  },

  text: { group: 'inline' },

  hard_break: {
    group: 'inline',
    inline: true,
    selectable: false,
    // Without this, every ProseMirror plain-text extraction (`Node.textContent`,
    // `textBetween`, and therefore the plain-text clipboard representation) treats
    // a leaf inline node without its own `leafText` as an empty string — two lines
    // separated by a hard break would silently merge into one word instead of
    // keeping a line break. See specs/kopieren-code.md Abschnitt 0.2, Befund A.
    leafText: () => '\n',
    parseDOM: [{ tag: 'br' }],
    toDOM() {
      return ['br']
    },
  },

  image: {
    group: 'block',
    attrs: {
      src: { validate: 'string' },
      alt: { default: '', validate: 'string' },
      // Display size in CSS px (96 dpi) or null (= intrinsic). Always number|null in the
      // model — parseDOM below normalises the HTML string form so roundtrip assertions and
      // the resize command never see a string or NaN. See bild-groesse-aendern-req.md §2/§3.16.
      width: { default: null },
      height: { default: null },
      // Editor-internal original size for "reset to original". Session-only: deliberately
      // NOT rendered to the DOM (toDOM omits them) and NOT serialised to DOCX/ODT
      // (no OOXML/ODF field for it). See §2.5 / §3.17.
      naturalWidth: { default: null },
      naturalHeight: { default: null },
    },
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => {
          const el = dom as HTMLImageElement
          const toNum = (v: string | null): number | null => {
            if (v === null || v === '') return null
            const n = Number(v)
            return Number.isFinite(n) && n > 0 ? n : null
          }
          return {
            src: el.getAttribute('src'),
            alt: el.getAttribute('alt') || '',
            width: toNum(el.getAttribute('width')),
            height: toNum(el.getAttribute('height')),
          }
        },
      },
    ],
    toDOM(node) {
      // Only src/alt/width/height reach the DOM; naturalWidth/naturalHeight stay internal.
      const { src, alt, width, height } = node.attrs
      const attrs: Record<string, string> = { src, alt }
      if (width != null) attrs.width = String(width)
      if (height != null) attrs.height = String(height)
      return ['img', attrs]
    },
  },

  // Manual, user-forced page break (specs/seitenumbruch-req.md §3.3). Modelled as its
  // own atom block node (not a paragraph attribute): one uniform representation for
  // every position (between paragraphs, before/after tables/images/lists, at the doc
  // end), directly selectable/deletable like an image, and one clean undo step. The
  // cross-format asymmetry is resolved in the writers/readers: DOCX encodes it as an
  // inline `<w:br w:type="page"/>` run (docx/writer.ts), ODF as `fo:break-before="page"`
  // on the following paragraph's style (odt/writer.ts) — see §3.4–3.7 of the req.
  // parseDOM/toDOM keep it intact across in-editor copy/paste (§3.11).
  page_break: {
    group: 'block',
    atom: true,
    selectable: true,
    // Plain-text extractions (clipboard) have no page concept — a line break is the
    // closest lossless-ish stand-in (same rationale as hard_break's leafText).
    leafText: () => '\n',
    parseDOM: [{ tag: 'div[data-page-break]' }],
    toDOM() {
      return ['div', { 'data-page-break': 'true', class: 'pm-page-break', role: 'separator', 'aria-label': 'Seitenumbruch' }]
    },
  },

  // Placeholder for content the reader could not fully interpret (e.g. a DOCX/ODT
  // textbox, embedded chart/OLE object) — keeps at least the recoverable text/blocks
  // visible and editable instead of silently dropping them (see datei-oeffnen-req.md
  // §3.13). Deliberately permissive (`block+`) so the reader can always populate it;
  // `assertLoadableDocument` relies on that permissiveness never being violated.
  unsupported_block: {
    group: 'block',
    content: 'block+',
    attrs: { kind: { default: 'object', validate: 'string' } },
    parseDOM: [
      {
        tag: 'div[data-unsupported-kind]',
        getAttrs: (dom) => ({ kind: (dom as HTMLElement).dataset.unsupportedKind || 'object' }),
      },
    ],
    toDOM(node) {
      return [
        'div',
        {
          class: 'unsupported-block',
          'data-unsupported-kind': node.attrs.kind,
          title: UNSUPPORTED_KIND_LABEL[node.attrs.kind as string] ?? UNSUPPORTED_KIND_LABEL.object,
        },
        0,
      ]
    },
  },

  bullet_list: {
    group: 'block',
    content: 'list_item+',
    parseDOM: [{ tag: 'ul' }],
    toDOM() {
      return ['ul', 0]
    },
  },

  ordered_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { start: { default: 1, validate: 'number' } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({ start: Number((dom as HTMLElement).getAttribute('start')) || 1 }),
      },
    ],
    toDOM(node) {
      return node.attrs.start === 1 ? ['ol', 0] : ['ol', { start: node.attrs.start }, 0]
    },
  },

  // Deliberately `block+` rather than `paragraph block*`: real-world ODT/DOCX files
  // routinely produce a list item whose only content is a nested list (no own
  // paragraph, e.g. multi-level lists authored directly at a sub-level) or a bare
  // image — see e.g. the `listLevel10.odt`/`imageWithinList.odt` fixtures in
  // `tests/fixtures/external/odt`. Requiring a leading paragraph rejected those as
  // schema-incompatible (caught by `assertLoadableDocument`, turning a real,
  // importable document into a hard import error).
  list_item: {
    content: 'block+',
    parseDOM: [{ tag: 'li' }],
    toDOM() {
      return ['li', 0]
    },
  },

  ...tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} }),
}

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight', getAttrs: (v) => /^(bold|[5-9]\d{2,})$/.test(v as string) && null }],
    toDOM() {
      return ['strong', 0]
    },
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM() {
      return ['em', 0]
    },
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() {
      return ['u', 0]
    },
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
    toDOM() {
      return ['s', 0]
    },
  },
  textColor: {
    attrs: { color: { validate: 'string' } },
    parseDOM: [{ style: 'color', getAttrs: (value) => ({ color: value }) }],
    toDOM(mark) {
      return ['span', { style: `color: ${mark.attrs.color}` }, 0]
    },
  },
  highlight: {
    attrs: { color: { validate: 'string' } },
    parseDOM: [{ style: 'background-color', getAttrs: (value) => ({ color: value }) }],
    toDOM(mark) {
      return ['span', { style: `background-color: ${mark.attrs.color}` }, 0]
    },
  },

  // Hyperlink (specs/hyperlink-einfuegen-req.md) — Datenmodell-Scheibe: das Mark trägt
  // die Ziel-URL; Import/Export laufen über text:a (ODT) bzw. w:hyperlink+Relationship
  // (DOCX, folgt). `inclusive: false`, damit direkt hinter einem Link getippter Text
  // NICHT mitverlinkt wird (Word-/Docs-Verhalten). Die parseDOM-Regel greift auch beim
  // HTML-Paste; javascript:-URLs entschärft der Paste-Sanitizer bereits vorab
  // (paste.ts, sanitizePastedHtml Schritt 3). Command/Dialog/Toolbar folgen als
  // nächste Scheibe der req.
  link: {
    attrs: { href: { validate: 'string' } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute('href') ?? '' }),
      },
    ],
    toDOM(mark) {
      return ['a', { href: mark.attrs.href }, 0]
    },
  },
}

export const wordSchema = new Schema({ nodes, marks })

/** The plain-JSON shape produced by `node.toJSON()` / consumed by `Node.fromJSON(schema, json)`. */
export type ProseMirrorJSON = Record<string, unknown>
