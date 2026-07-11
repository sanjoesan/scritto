import JSZip from 'jszip'
import type { WordDocumentContent } from '../shared/documentModel'
import { assertLoadableDocument } from '../shared/validateDocument'
import { OOXML_NAMESPACES, parseXmlDocument } from './xmlUtil'

interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

const JC_TO_ALIGN: Record<string, string> = { left: 'left', center: 'center', right: 'right', both: 'justify' }

function childElements(el: Element, ns: string, localName: string): Element[] {
  return Array.from(el.children).filter((child) => child.namespaceURI === ns && child.localName === localName)
}

function firstChildNS(el: Element, ns: string, localName: string): Element | null {
  return childElements(el, ns, localName)[0] ?? null
}

async function readRelationships(zip: JSZip, relsPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const text = await zip.file(relsPath)?.async('text')
  if (!text) return map
  const doc = parseXmlDocument(text)
  for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target')
    if (id && target) map.set(id, target)
  }
  return map
}

function resolvePartPath(basePath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const baseDir = basePath.split('/').slice(0, -1)
  const parts = target.split('/')
  const stack = [...baseDir]
  for (const part of parts) {
    if (part === '..') stack.pop()
    else if (part !== '.') stack.push(part)
  }
  return stack.join('/')
}

interface HeadingInfo {
  outlineLvlByStyleId: Map<string, number>
}

function parseStylesXml(stylesDoc: Document | null): HeadingInfo {
  const outlineLvlByStyleId = new Map<string, number>()
  if (!stylesDoc) return { outlineLvlByStyleId }
  for (const styleEl of Array.from(stylesDoc.getElementsByTagNameNS(OOXML_NAMESPACES.w, 'style'))) {
    const styleId = styleEl.getAttributeNS(OOXML_NAMESPACES.w, 'styleId')
    if (!styleId) continue
    const pPr = firstChildNS(styleEl, OOXML_NAMESPACES.w, 'pPr')
    const outlineLvl = pPr && firstChildNS(pPr, OOXML_NAMESPACES.w, 'outlineLvl')
    if (outlineLvl) {
      const val = Number(outlineLvl.getAttributeNS(OOXML_NAMESPACES.w, 'val') ?? '0')
      outlineLvlByStyleId.set(styleId, val)
    }
  }
  return { outlineLvlByStyleId }
}

function headingLevelForStyle(styleId: string | null, info: HeadingInfo): number | null {
  if (!styleId) return null
  const fromStyles = info.outlineLvlByStyleId.get(styleId)
  if (fromStyles !== undefined) return fromStyles + 1
  const match = /^Heading\s?([1-6])$/i.exec(styleId)
  if (match) return Number(match[1])
  return null
}

/** numId → (w:ilvl → bullet|ordered), read from EVERY `<w:lvl>` of the abstractNum.
 * Word encodes mixed-type chains (e.g. bullet on level 0, decimal on level 1) inside
 * ONE abstractNum; the previous first-`<w:lvl>`-only read forced every level of such a
 * foreign file onto a single kind (liste-einruecken-tab-req.md Befund C — the reader
 * half of §5A Option B; the writer deliberately keeps its static two-num scheme). */
export type ListKindsByNumId = Map<string, Map<number, 'bullet' | 'ordered'>>

function parseNumberingXml(numberingDoc: Document | null): ListKindsByNumId {
  const kindByNumId: ListKindsByNumId = new Map()
  if (!numberingDoc) return kindByNumId
  const abstractKindsById = new Map<string, Map<number, 'bullet' | 'ordered'>>()
  for (const abstractEl of Array.from(numberingDoc.getElementsByTagNameNS(OOXML_NAMESPACES.w, 'abstractNum'))) {
    const id = abstractEl.getAttributeNS(OOXML_NAMESPACES.w, 'abstractNumId')
    const levels = new Map<number, 'bullet' | 'ordered'>()
    for (const lvl of childElements(abstractEl, OOXML_NAMESPACES.w, 'lvl')) {
      const ilvl = Number(lvl.getAttributeNS(OOXML_NAMESPACES.w, 'ilvl') ?? '0') || 0
      const fmt = firstChildNS(lvl, OOXML_NAMESPACES.w, 'numFmt')?.getAttributeNS(OOXML_NAMESPACES.w, 'val')
      levels.set(ilvl, fmt === 'bullet' ? 'bullet' : 'ordered')
    }
    if (id) abstractKindsById.set(id, levels)
  }
  for (const numEl of Array.from(numberingDoc.getElementsByTagNameNS(OOXML_NAMESPACES.w, 'num'))) {
    const numId = numEl.getAttributeNS(OOXML_NAMESPACES.w, 'numId')
    const abstractRef = firstChildNS(numEl, OOXML_NAMESPACES.w, 'abstractNumId')
    const abstractId = abstractRef?.getAttributeNS(OOXML_NAMESPACES.w, 'val')
    if (numId && abstractId && abstractKindsById.has(abstractId)) {
      kindByNumId.set(numId, abstractKindsById.get(abstractId)!)
    }
  }
  return kindByNumId
}

/** The list kind for one concrete (numId, ilvl): the level's own entry, else the
 * level-0 entry (Word inherits sparsely defined deep levels), else 'ordered' for a
 * known-but-empty abstractNum (previous behaviour) / 'bullet' for an unknown numId. */
function listKindFor(kindByNumId: ListKindsByNumId, numId: string, ilvl: number): 'bullet' | 'ordered' {
  const levels = kindByNumId.get(numId)
  if (!levels) return 'bullet'
  return levels.get(ilvl) ?? levels.get(0) ?? 'ordered'
}

function marksFromRunProperties(rPr: Element | null): Array<{ type: string; attrs?: Record<string, unknown> }> {
  if (!rPr) return []
  const marks: Array<{ type: string; attrs?: Record<string, unknown> }> = []
  if (firstChildNS(rPr, OOXML_NAMESPACES.w, 'b')) marks.push({ type: 'strong' })
  if (firstChildNS(rPr, OOXML_NAMESPACES.w, 'i')) marks.push({ type: 'em' })
  const underline = firstChildNS(rPr, OOXML_NAMESPACES.w, 'u')
  if (underline && underline.getAttributeNS(OOXML_NAMESPACES.w, 'val') !== 'none') marks.push({ type: 'underline' })
  if (firstChildNS(rPr, OOXML_NAMESPACES.w, 'strike')) marks.push({ type: 'strike' })
  const color = firstChildNS(rPr, OOXML_NAMESPACES.w, 'color')
  const colorVal = color?.getAttributeNS(OOXML_NAMESPACES.w, 'val')
  if (colorVal && colorVal !== 'auto') marks.push({ type: 'textColor', attrs: { color: `#${colorVal}` } })
  const shd = firstChildNS(rPr, OOXML_NAMESPACES.w, 'shd')
  const fill = shd?.getAttributeNS(OOXML_NAMESPACES.w, 'fill')
  if (fill && fill !== 'auto') marks.push({ type: 'highlight', attrs: { color: `#${fill}` } })
  // w:rFonts: kanonisch w:ascii, ersatzweise w:hAnsi (schriftart-waehlen-req.md §2.8).
  // Nur-w:eastAsia oder reine Theme-Referenzen (w:asciiTheme, Grenzfälle 3.14/3.15)
  // erzeugen BEWUSST keinen Mark — der Text fällt auf die Basisschrift, statt dass ein
  // Name erfunden würde; Theme-Auflösung ist laut req §5.4 Nicht-Ziel.
  const rFonts = firstChildNS(rPr, OOXML_NAMESPACES.w, 'rFonts')
  const familyName =
    rFonts?.getAttributeNS(OOXML_NAMESPACES.w, 'ascii') || rFonts?.getAttributeNS(OOXML_NAMESPACES.w, 'hAnsi')
  if (familyName) marks.push({ type: 'fontFamily', attrs: { family: familyName } })
  // w:sz = halbe Punkte → pt exakt (Importwerte werden NIE geclamped/gerundet,
  // schriftgroesse-waehlen-req.md §2.5).
  const sz = firstChildNS(rPr, OOXML_NAMESPACES.w, 'sz')
  const szVal = Number(sz?.getAttributeNS(OOXML_NAMESPACES.w, 'val'))
  if (sz && Number.isFinite(szVal) && szVal > 0) marks.push({ type: 'fontSize', attrs: { pt: szVal / 2 } })
  return marks
}

interface RunLike {
  kind: 'text' | 'break' | 'pageBreak' | 'image' | 'unsupported'
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  imageRelId?: string
  imageAlt?: string
  imageWidth?: number | null
  imageHeight?: number | null
  unsupportedKind?: 'textbox' | 'object'
  unsupportedBlocks?: JsonNode[]
}

// OOXML drawing sizes are in EMU (English Metric Units): 914400 per inch, 96 px per
// inch → 9525 EMU per CSS px. Reading <wp:extent> so an imported image keeps its real
// size instead of falling back to a hard-coded default on the next export.
const EMU_PER_PX = 914400 / 96
function emuAttrToPx(value: string | null): number | null {
  if (!value) return null
  const emu = Number(value)
  if (!Number.isFinite(emu) || emu <= 0) return null
  return Math.round(emu / EMU_PER_PX)
}

// A textbox can itself contain a paragraph with another textbox — cap the recursion
// at one level so a pathological/self-referential file can't blow the call stack;
// past this depth a nested textbox degrades to an opaque "object" placeholder instead
// of being unpacked further.
const MAX_TEXTBOX_NESTING_DEPTH = 1

/**
 * Decides what a `<w:drawing>` or legacy `<w:pict>` element represents:
 * - an actual image (`a:blip` / `v:imagedata` present) → an `image` run, as before.
 * - otherwise a textbox (`w:txbxContent`, present identically for both the modern
 *   `wps:txbx` and legacy `v:textbox` wrappers) → its paragraphs are kept as an
 *   `unsupported` run so the visible text survives instead of vanishing.
 * - otherwise (a chart/OLE/diagram with no extractable text) → an opaque
 *   `unsupported` run with no content, still rendered as a visible placeholder
 *   rather than disappearing without a trace (see datei-oeffnen-req.md §3.13).
 */
function decodeDrawingOrPict(
  el: Element,
  headingInfo: HeadingInfo,
  imageRels: Map<string, string>,
  depth: number,
): RunLike {
  const blip = el.getElementsByTagNameNS(OOXML_NAMESPACES.a, 'blip')[0]
  const imagedata = el.getElementsByTagNameNS(OOXML_NAMESPACES.vml, 'imagedata')[0]
  const relId =
    blip?.getAttributeNS(OOXML_NAMESPACES.r, 'embed') ?? imagedata?.getAttributeNS(OOXML_NAMESPACES.r, 'id') ?? undefined
  if (relId) {
    const docPr = el.getElementsByTagNameNS(OOXML_NAMESPACES.wp, 'docPr')[0]
    const extent = el.getElementsByTagNameNS(OOXML_NAMESPACES.wp, 'extent')[0]
    return {
      kind: 'image',
      imageRelId: relId,
      imageAlt: docPr?.getAttribute('name') ?? '',
      imageWidth: emuAttrToPx(extent?.getAttribute('cx') ?? null),
      imageHeight: emuAttrToPx(extent?.getAttribute('cy') ?? null),
    }
  }

  const txbxContent = el.getElementsByTagNameNS(OOXML_NAMESPACES.w, 'txbxContent')[0]
  if (txbxContent) {
    if (depth >= MAX_TEXTBOX_NESTING_DEPTH) return { kind: 'unsupported', unsupportedKind: 'object' }
    const unsupportedBlocks = childElements(txbxContent, OOXML_NAMESPACES.w, 'p').flatMap((p) =>
      paragraphToBlocks(p, headingInfo, imageRels, depth + 1),
    )
    return { kind: 'unsupported', unsupportedKind: 'textbox', unsupportedBlocks }
  }

  return { kind: 'unsupported', unsupportedKind: 'object' }
}

function decodeRunElement(
  rEl: Element,
  headingInfo: HeadingInfo,
  imageRels: Map<string, string>,
  depth: number,
  extraMarks: Array<{ type: string; attrs?: Record<string, unknown> }> = [],
): RunLike[] {
  const rPr = firstChildNS(rEl, OOXML_NAMESPACES.w, 'rPr')
  const marks = [...marksFromRunProperties(rPr), ...extraMarks]
  const out: RunLike[] = []
  for (const child of Array.from(rEl.children)) {
    if (child.namespaceURI === OOXML_NAMESPACES.w && child.localName === 't') {
      out.push({ kind: 'text', text: child.textContent ?? '', marks: marks.length ? marks : undefined })
    } else if (child.namespaceURI === OOXML_NAMESPACES.w && child.localName === 'br') {
      // `w:type="page"` is a MANUAL page break (Word's Ctrl+Enter) and must stay one —
      // it was previously degraded to a plain line break, a silent data loss
      // (seitenumbruch-req.md §0.6/§3.5). A `w:br` without type (or type
      // "textWrapping") remains the plain line break (real evidence: 60329.docx with
      // 85 such runs, none of which may be promoted).
      const brType = child.getAttributeNS(OOXML_NAMESPACES.w, 'type')
      out.push(brType === 'page' ? { kind: 'pageBreak' } : { kind: 'break' })
    } else if (child.namespaceURI === OOXML_NAMESPACES.w && child.localName === 'lastRenderedPageBreak') {
      // Word's cached marker for an AUTOMATIC break at last save — deliberately ignored
      // (it is not a manual break and must not become one; §3.5, previously this fell
      // through the if/else chain only by accident).
    } else if (child.namespaceURI === OOXML_NAMESPACES.w && (child.localName === 'drawing' || child.localName === 'pict')) {
      out.push(decodeDrawingOrPict(child, headingInfo, imageRels, depth))
    }
  }
  return out
}

/**
 * Collects runs from a paragraph, descending into the wrapper elements real Word
 * files routinely place runs inside — a hyperlink, an accepted tracked insertion, a
 * smart tag, a content-control (`w:sdt`), or a simple field's cached result
 * (`w:fldSimple`) — so their visible text is not silently dropped (see
 * datei-oeffnen-code.md §2). A tracked *deletion* (`w:del`) is skipped outright: its
 * text must not resurface as if it were still part of the document.
 */
function collectRuns(
  container: Element,
  runs: RunLike[],
  headingInfo: HeadingInfo,
  imageRels: Map<string, string>,
  depth: number,
  extraMarks: Array<{ type: string; attrs?: Record<string, unknown> }> = [],
): void {
  for (const child of Array.from(container.children)) {
    if (child.namespaceURI !== OOXML_NAMESPACES.w) continue
    if (child.localName === 'r') {
      runs.push(...decodeRunElement(child, headingInfo, imageRels, depth, extraMarks))
    } else if (child.localName === 'del') {
      // Deleted (rejected/pending) tracked-change text — must not become visible.
    } else if (child.localName === 'hyperlink') {
      // External hyperlink: the r:id resolves to the URL via the (type-neutral) rels
      // map — previously only the visible text survived and the target was dropped
      // (hyperlink-einfuegen-req.md §0.4). A `w:anchor`-only hyperlink (internal jump
      // target, explicitly out of scope there) keeps its text without a link mark.
      const relId = child.getAttributeNS(OOXML_NAMESPACES.r, 'id')
      const target = relId ? imageRels.get(relId) : undefined
      const marks = target ? [...extraMarks, { type: 'link', attrs: { href: target } }] : extraMarks
      collectRuns(child, runs, headingInfo, imageRels, depth, marks)
    } else if (child.localName === 'ins' || child.localName === 'smartTag') {
      collectRuns(child, runs, headingInfo, imageRels, depth, extraMarks)
    } else if (child.localName === 'sdt') {
      const sdtContent = firstChildNS(child, OOXML_NAMESPACES.w, 'sdtContent')
      if (sdtContent) collectRuns(sdtContent, runs, headingInfo, imageRels, depth, extraMarks)
    } else if (child.localName === 'fldSimple') {
      collectRuns(child, runs, headingInfo, imageRels, depth, extraMarks)
    }
  }
}

function decodeParagraphRuns(pEl: Element, headingInfo: HeadingInfo, imageRels: Map<string, string>, depth = 0): RunLike[] {
  const runs: RunLike[] = []
  collectRuns(pEl, runs, headingInfo, imageRels, depth)
  return runs
}

function emptyParagraph(): JsonNode {
  return { type: 'paragraph', attrs: { align: 'left' } }
}

/** A `<w:p>` may mix text, image-drawing and unsupported-object runs — split it into block nodes. */
function paragraphToBlocks(
  pEl: Element,
  headingInfo: HeadingInfo,
  imageRels: Map<string, string>,
  depth = 0,
): JsonNode[] {
  const pPr = firstChildNS(pEl, OOXML_NAMESPACES.w, 'pPr')
  const pStyleEl = pPr && firstChildNS(pPr, OOXML_NAMESPACES.w, 'pStyle')
  const styleId = pStyleEl?.getAttributeNS(OOXML_NAMESPACES.w, 'val') ?? null
  const jcEl = pPr && firstChildNS(pPr, OOXML_NAMESPACES.w, 'jc')
  const jcVal = jcEl?.getAttributeNS(OOXML_NAMESPACES.w, 'val') ?? 'left'
  const align = JC_TO_ALIGN[jcVal] ?? 'left'
  const level = headingLevelForStyle(styleId, headingInfo)

  const runs = decodeParagraphRuns(pEl, headingInfo, imageRels, depth)
  const hasBlockRun = runs.some((r) => r.kind === 'image' || r.kind === 'unsupported' || r.kind === 'pageBreak')

  if (!hasBlockRun) {
    const content = runsToInline(runs)
    // Mirror ProseMirror's own Node.toJSON(), which omits `content` entirely for an
    // empty fragment rather than emitting `content: []` — otherwise a freshly created
    // blank document and the same document after an export/import round trip would be
    // structurally different (`toEqual`) despite ProseMirror treating them as the same
    // node (`.eq()` true). See createBlankWordDocument()/emptyDocJSON() in documentModel.ts.
    if (level) return [content.length > 0 ? { type: 'heading', attrs: { level, align }, content } : { type: 'heading', attrs: { level, align } }]
    return [content.length > 0 ? { type: 'paragraph', attrs: { align }, content } : { type: 'paragraph', attrs: { align } }]
  }

  const blocks: JsonNode[] = []
  let buffer: RunLike[] = []
  const flush = () => {
    if (buffer.length === 0) return
    const content = runsToInline(buffer)
    // Text parts keep the paragraph's block type: a heading split around a page break
    // (or an inline image) must not silently degrade its text to plain paragraphs —
    // the round trip "Überschrift direkt vor/nach dem Umbruch" depends on it
    // (seitenumbruch-req.md §5.2.6).
    const type = level ? 'heading' : 'paragraph'
    const attrs = level ? { level, align } : { align }
    if (content.length > 0) blocks.push({ type, attrs, content })
    buffer = []
  }
  for (const run of runs) {
    if (run.kind === 'pageBreak') {
      // A paragraph containing ONLY a break run collapses to a bare page_break node —
      // the exact inverse of the writer's standalone break-paragraph (§3.4/§3.5).
      flush()
      blocks.push({ type: 'page_break' })
    } else if (run.kind === 'image') {
      flush()
      const target = run.imageRelId ? imageRels.get(run.imageRelId) : undefined
      blocks.push({
        type: 'image',
        attrs: {
          src: target ?? '',
          alt: run.imageAlt ?? '',
          width: run.imageWidth ?? null,
          height: run.imageHeight ?? null,
          // the size read from the file is this image's "original" for reset-to-original
          naturalWidth: run.imageWidth ?? null,
          naturalHeight: run.imageHeight ?? null,
        },
      })
    } else if (run.kind === 'unsupported') {
      flush()
      const content = run.unsupportedBlocks?.length ? run.unsupportedBlocks : [emptyParagraph()]
      blocks.push({ type: 'unsupported_block', attrs: { kind: run.unsupportedKind ?? 'object' }, content })
    } else {
      buffer.push(run)
    }
  }
  flush()
  return blocks
}

function runsToInline(runs: RunLike[]): JsonNode[] {
  return runs
    .filter((r) => r.kind === 'text' || r.kind === 'break')
    .map((r) => (r.kind === 'break' ? { type: 'hard_break' } : { type: 'text', text: r.text ?? '', marks: r.marks }))
    .filter((n) => n.type !== 'text' || n.text)
}

interface ListMarker {
  numId: string | null
  ilvl: number
}

function listMarkerFor(pEl: Element): ListMarker {
  const pPr = firstChildNS(pEl, OOXML_NAMESPACES.w, 'pPr')
  const numPr = pPr && firstChildNS(pPr, OOXML_NAMESPACES.w, 'numPr')
  const numIdEl = numPr && firstChildNS(numPr, OOXML_NAMESPACES.w, 'numId')
  const ilvlEl = numPr && firstChildNS(numPr, OOXML_NAMESPACES.w, 'ilvl')
  const numId = numIdEl?.getAttributeNS(OOXML_NAMESPACES.w, 'val') ?? null
  const ilvl = Number(ilvlEl?.getAttributeNS(OOXML_NAMESPACES.w, 'val') ?? '0') || 0
  return { numId, ilvl }
}

// Real-world files can nest tables absurdly deeply (a known parser-fuzzing pattern —
// "deep-table-cell.docx" in the Apache POI test corpus nests hundreds of levels and
// blew the call stack here before this guard existed). Past this depth we stop
// descending into further nested tables and keep just their paragraph text, rather
// than crashing the whole import.
const MAX_TABLE_NESTING_DEPTH = 25

function parseTable(tblEl: Element, headingInfo: HeadingInfo, imageRels: Map<string, string>, depth = 0): JsonNode {
  const rowEls = childElements(tblEl, OOXML_NAMESPACES.w, 'tr')
  const colCount =
    childElements(tblEl, OOXML_NAMESPACES.w, 'tblGrid')[0]?.getElementsByTagNameNS(OOXML_NAMESPACES.w, 'gridCol')
      .length ?? 1
  // Tracks, per grid column, the anchor cell node a vMerge continuation should extend.
  const anchors: Array<JsonNode | null> = Array.from({ length: colCount }, () => null)

  const rows: JsonNode[] = rowEls.map((rowEl) => {
    const cells: JsonNode[] = []
    let col = 0
    for (const tcEl of childElements(rowEl, OOXML_NAMESPACES.w, 'tc')) {
      const tcPr = firstChildNS(tcEl, OOXML_NAMESPACES.w, 'tcPr')
      const gridSpanEl = tcPr && firstChildNS(tcPr, OOXML_NAMESPACES.w, 'gridSpan')
      const colspan = Number(gridSpanEl?.getAttributeNS(OOXML_NAMESPACES.w, 'val') ?? '1') || 1
      const vMergeEl = tcPr && firstChildNS(tcPr, OOXML_NAMESPACES.w, 'vMerge')
      const vMergeVal = vMergeEl?.getAttributeNS(OOXML_NAMESPACES.w, 'val')
      const isContinuation = !!vMergeEl && vMergeVal !== 'restart'

      if (isContinuation) {
        const anchor = col < colCount ? anchors[col] : null
        if (anchor?.attrs) anchor.attrs.rowspan = (Number(anchor.attrs.rowspan) || 1) + 1
        col += colspan
        continue
      }

      const content = childElements(tcEl, OOXML_NAMESPACES.w, 'p').flatMap((p) =>
        paragraphToBlocks(p, headingInfo, imageRels),
      )
      if (depth < MAX_TABLE_NESTING_DEPTH) {
        content.push(
          ...childElements(tcEl, OOXML_NAMESPACES.w, 'tbl').map((t) => parseTable(t, headingInfo, imageRels, depth + 1)),
        )
      }
      // A cell without any recognized child (rare, but real files exist without a
      // `<w:p>` at all) must still satisfy table_cell's non-empty `block+` content
      // model — fall back to an empty paragraph rather than risk an uncheckable node.
      const cellNode: JsonNode = {
        type: 'table_cell',
        attrs: { colspan, rowspan: 1, colwidth: null },
        content: content.length ? content : [emptyParagraph()],
      }
      cells.push(cellNode)

      for (let c = col; c < Math.min(col + colspan, colCount); c++) {
        anchors[c] = vMergeVal === 'restart' ? cellNode : null
      }
      col += colspan
    }
    return { type: 'table_row', content: cells }
  })

  return { type: 'table', content: rows }
}

/**
 * Reconstructs list nesting from a flat sequence of paragraphs/blocks. Real Word files
 * represent a nested list not as actual XML nesting but as a flat run of `<w:p>`
 * elements that all share one `w:numId` and differ only in `w:ilvl` (indent level).
 * This walks that flat sequence with a small stack of "list currently being built"
 * frames, one per currently-open indent level: a jump to a deeper `w:ilvl` opens a new
 * nested `bullet_list`/`ordered_list` inside the `list_item` just added at the
 * shallower level, and a jump back to a shallower level closes and re-attaches the
 * finished nested list as a further block inside that `list_item` — see
 * datei-oeffnen-req.md §6 criterion 2 ("Listen … -Verschachtelung … bleiben
 * identisch"). Without this, every paragraph sharing a `numId` collapses into one flat
 * list regardless of its `w:ilvl`.
 */
function groupLists(items: Array<{ marker: ListMarker; blocks: JsonNode[] }>, kindByNumId: ListKindsByNumId): JsonNode[] {
  interface Frame {
    numId: string
    ilvl: number
    node: JsonNode // bullet_list/ordered_list under construction; node.content holds its list_items
  }

  const result: JsonNode[] = []
  const stack: Frame[] = []

  const openFrame = (numId: string, ilvl: number) => {
    const kind = listKindFor(kindByNumId, numId, ilvl)
    stack.push({ numId, ilvl, node: { type: kind === 'ordered' ? 'ordered_list' : 'bullet_list', content: [] } })
  }

  const closeFrame = () => {
    const frame = stack.pop()!
    if (stack.length === 0) {
      result.push(frame.node)
      return
    }
    const parentItems = stack[stack.length - 1].node.content as JsonNode[]
    const lastItem = parentItems[parentItems.length - 1]
    lastItem.content = [...(lastItem.content ?? []), frame.node]
  }

  const closeAll = () => {
    while (stack.length) closeFrame()
  }

  for (const { marker, blocks } of items) {
    if (!marker.numId) {
      closeAll()
      result.push(...blocks)
      continue
    }
    const { numId, ilvl } = marker
    const top = stack[stack.length - 1]
    if (!top) {
      openFrame(numId, ilvl)
    } else if (top.numId === numId && top.ilvl === ilvl) {
      // Same list, same level as the item just added — nothing to open/close.
    } else if (ilvl > top.ilvl) {
      // Deeper indent — start a nested list inside the item just added at `top`.
      openFrame(numId, ilvl)
    } else {
      // Shallower indent (or same indent but a different list/numId): close every
      // frame deeper than the target level, then, if what remains open doesn't
      // already match this marker, close it too and start a fresh frame.
      while (stack.length && stack[stack.length - 1].ilvl > ilvl) closeFrame()
      const matched = stack[stack.length - 1]
      if (!matched || matched.ilvl !== ilvl || matched.numId !== numId) {
        if (matched && matched.ilvl === ilvl) closeFrame()
        openFrame(numId, ilvl)
      }
    }
    const currentTop = stack[stack.length - 1]
    ;(currentTop.node.content as JsonNode[]).push({ type: 'list_item', content: blocks })
  }
  closeAll()
  return result
}

async function resolveImageSources(zip: JSZip, blocks: JsonNode[]): Promise<void> {
  const tasks: Promise<void>[] = []
  const visit = (node: JsonNode) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string' && node.attrs.src) {
      const path = resolvePartPath('word/document.xml', node.attrs.src as string)
      const entry = zip.file(path)
      if (entry) {
        tasks.push(
          entry.async('base64').then((base64) => {
            const ext = path.split('.').pop()?.toLowerCase() ?? 'png'
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

async function readBodyChildren(
  bodyEl: Element,
  headingInfo: HeadingInfo,
  kindByNumId: ListKindsByNumId,
  imageRels: Map<string, string>,
  zip: JSZip,
): Promise<JsonNode[]> {
  const items: Array<{ marker: ListMarker; blocks: JsonNode[] }> = []
  for (const child of Array.from(bodyEl.children)) {
    if (child.namespaceURI === OOXML_NAMESPACES.w && child.localName === 'p') {
      const marker = listMarkerFor(child)
      const blocks = paragraphToBlocks(child, headingInfo, imageRels)
      if (marker.numId && blocks.length > 0) {
        // ALL blocks a list paragraph splits into (text parts, inline images, rescued
        // unsupported content) stay together in ONE list item — previously only the
        // `paragraph` parts kept the marker, so an image-only list point fell OUT of
        // its list and split it in two (liste-einruecken-tab-req.md Befund C /
        // Grenzfall 4.6; `list_item` is `block+`, so any block mix is schema-legal).
        items.push({ marker, blocks })
      } else {
        for (const block of blocks) items.push({ marker: { numId: null, ilvl: 0 }, blocks: [block] })
      }
    } else if (child.namespaceURI === OOXML_NAMESPACES.w && child.localName === 'tbl') {
      items.push({ marker: { numId: null, ilvl: 0 }, blocks: [parseTable(child, headingInfo, imageRels)] })
    }
  }
  const grouped = groupLists(items, kindByNumId)
  await resolveImageSources(zip, grouped)
  return grouped
}

export async function readDocx(file: File | Blob): Promise<WordDocumentContent> {
  const zip = await JSZip.loadAsync(file)

  const documentXmlText = await zip.file('word/document.xml')?.async('text')
  if (!documentXmlText) throw new Error('word/document.xml fehlt — keine gültige DOCX-Datei.')
  const documentDoc = parseXmlDocument(documentXmlText)
  const bodyEl = documentDoc.getElementsByTagNameNS(OOXML_NAMESPACES.w, 'body')[0]

  const stylesXmlText = await zip.file('word/styles.xml')?.async('text')
  const headingInfo = parseStylesXml(stylesXmlText ? parseXmlDocument(stylesXmlText) : null)

  const numberingXmlText = await zip.file('word/numbering.xml')?.async('text')
  const kindByNumId = parseNumberingXml(numberingXmlText ? parseXmlDocument(numberingXmlText) : null)

  const documentRels = await readRelationships(zip, 'word/_rels/document.xml.rels')

  const bodyBlocks = bodyEl ? await readBodyChildren(bodyEl, headingInfo, kindByNumId, documentRels, zip) : []

  let headerBlocks: JsonNode[] | null = null
  let footerBlocks: JsonNode[] | null = null
  const sectPr = bodyEl && firstChildNS(bodyEl, OOXML_NAMESPACES.w, 'sectPr')
  if (sectPr) {
    const headerRef = firstChildNS(sectPr, OOXML_NAMESPACES.w, 'headerReference')
    const footerRef = firstChildNS(sectPr, OOXML_NAMESPACES.w, 'footerReference')
    const headerRelId = headerRef?.getAttributeNS(OOXML_NAMESPACES.r, 'id')
    const footerRelId = footerRef?.getAttributeNS(OOXML_NAMESPACES.r, 'id')

    // r:embed/r:id in einem Kopf-/Fußzeilen-Part löst OOXML gegen die PART-EIGENE
    // .rels-Datei auf (word/_rels/header1.xml.rels) — nicht gegen document.xml.rels.
    // Vorher wurde nur letztere verwendet, wodurch Bilder importierter Kopf-/Fußzeilen
    // (typisch: Firmenlogo) nie aufgelöst wurden (kopfzeile-bearbeiten-req.md §0.A/1).
    const readPart = async (relId: string): Promise<JsonNode[] | null> => {
      const path = resolvePartPath('word/document.xml', documentRels.get(relId)!)
      const text = await zip.file(path)?.async('text')
      if (!text) return null
      const partName = path.split('/').pop()!
      const partRels = await readRelationships(zip, `word/_rels/${partName}.rels`)
      const root = parseXmlDocument(text).documentElement
      return readBodyChildren(root, headingInfo, kindByNumId, partRels, zip)
    }
    if (headerRelId && documentRels.has(headerRelId)) headerBlocks = await readPart(headerRelId)
    if (footerRelId && documentRels.has(footerRelId)) footerBlocks = await readPart(footerRelId)
  }

  let title = ''
  const coreXmlText = await zip.file('docProps/core.xml')?.async('text')
  if (coreXmlText) {
    const coreDoc = parseXmlDocument(coreXmlText)
    title = coreDoc.getElementsByTagNameNS(OOXML_NAMESPACES.dc, 'title')[0]?.textContent ?? ''
  }

  // A document ending on a manual page break gets an empty paragraph appended — the
  // "new page" needs a caret home in the editor (same normalisation the
  // insertPageBreak command applies, seitenumbruch-req.md Grenzfall 2).
  if (bodyBlocks[bodyBlocks.length - 1]?.type === 'page_break') bodyBlocks.push(emptyParagraph())

  // `doc`'s content model requires at least one block (`block+`) — a header/footer
  // part can legally exist but resolve to zero recognizable blocks (e.g. a header
  // containing only elements this reader doesn't extract text from), and an empty
  // array is still truthy, so `headerBlocks ? ... : null` alone doesn't catch it. Real
  // fixtures (`Bug54849.docx`, `Bug60341.docx`) hit exactly this and produced an
  // uncheckable `{ type: 'doc', content: [] }` without this fallback.
  const result: WordDocumentContent = {
    body: { type: 'doc', content: bodyBlocks.length ? bodyBlocks : [emptyParagraph()] },
    header: headerBlocks ? { type: 'doc', content: headerBlocks.length ? headerBlocks : [emptyParagraph()] } : null,
    footer: footerBlocks ? { type: 'doc', content: footerBlocks.length ? footerBlocks : [emptyParagraph()] } : null,
    meta: { title },
  }
  assertLoadableDocument(result)
  return result
}
