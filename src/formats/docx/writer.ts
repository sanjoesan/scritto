import JSZip from 'jszip'
import type { WordDocumentContent } from '../shared/documentModel'
import { escapeXml, WORD_NAMESPACE_DECLARATIONS } from './xmlUtil'
import { RelationshipRegistry, RELATIONSHIP_TYPES } from './relationships'
import { ImageCollector, type CollectedImage } from './imageCollector'
import { HEADING_STYLE_ID, headingStylesXml, BULLET_NUM_ID, ORDERED_NUM_ID, numberingXml } from './styleDefs'
import { defaultPageSetupXml } from './pageSetup'
import { stampZipEntriesForDeterminism } from '../shared/zipDeterminism'

interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

const JC_BY_ALIGN: Record<string, string> = { left: 'left', center: 'center', right: 'right', justify: 'both' }

function runPropertiesXml(marks: JsonNode['marks']): string {
  const props: string[] = []
  for (const mark of marks ?? []) {
    if (mark.type === 'strong') props.push('<w:b/>')
    if (mark.type === 'em') props.push('<w:i/>')
    if (mark.type === 'underline') props.push('<w:u w:val="single"/>')
    if (mark.type === 'strike') props.push('<w:strike/>')
    if (mark.type === 'textColor') props.push(`<w:color w:val="${String(mark.attrs?.color ?? '').replace('#', '')}"/>`)
    if (mark.type === 'highlight') {
      props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${String(mark.attrs?.color ?? '').replace('#', '')}"/>`)
    }
  }
  return props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''
}

function encodeRunText(text: string): string {
  const needsSpacePreserve = /^\s|\s$|\s{2}/.test(text)
  const escaped = escapeXml(text)
  return `<w:t${needsSpacePreserve ? ' xml:space="preserve"' : ''}>${escaped}</w:t>`
}

function inlineToRuns(nodes: JsonNode[] | undefined): string {
  if (!nodes) return ''
  const runs: string[] = []
  let buffer: { text: string; marks: JsonNode['marks'] } | null = null

  const flush = () => {
    if (!buffer) return
    runs.push(`<w:r>${runPropertiesXml(buffer.marks)}${encodeRunText(buffer.text)}</w:r>`)
    buffer = null
  }

  for (const node of nodes) {
    if (node.type === 'text') {
      if (buffer && JSON.stringify(buffer.marks) === JSON.stringify(node.marks)) {
        buffer.text += node.text ?? ''
      } else {
        flush()
        buffer = { text: node.text ?? '', marks: node.marks }
      }
    } else if (node.type === 'hard_break') {
      flush()
      runs.push('<w:r><w:br/></w:r>')
    }
  }
  flush()
  return runs.join('')
}

function paragraphPropsXml(align: string, extra = ''): string {
  const jc = JC_BY_ALIGN[align] ?? 'left'
  return `<w:pPr>${extra}<w:jc w:val="${jc}"/></w:pPr>`
}

function imageParagraphXml(node: JsonNode, images: ImageCollector, rels: RelationshipRegistry): string {
  const src = String(node.attrs?.src ?? '')
  const fileName = images.add(src)
  const relId = rels.add(RELATIONSHIP_TYPES.image, `media/${fileName.split('/').pop()}`)
  const widthPx = Number(node.attrs?.width ?? 300)
  const heightPx = Number(node.attrs?.height ?? 200)
  // EMUs: 914400 per inch, 96px per inch by convention.
  const cx = Math.round((widthPx / 96) * 914400)
  const cy = Math.round((heightPx / 96) * 914400)
  const alt = escapeXml(String(node.attrs?.alt ?? ''))
  return (
    `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="1" name="${alt || 'Bild'}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${alt || 'Bild'}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  )
}

interface ListContext {
  numId: number
  level: number
}

// OOXML only defines w:ilvl 0-8 (9 levels) — deeper nesting is clamped to the deepest
// defined level rather than emitting an ilvl value Word doesn't recognize.
const MAX_LIST_ILVL = 8

function blockToDocx(
  node: JsonNode,
  images: ImageCollector,
  rels: RelationshipRegistry,
  listContext: ListContext | null = null,
): string {
  switch (node.type) {
    case 'paragraph': {
      const align = (node.attrs?.align as string) ?? 'left'
      const numPr = listContext
        ? `<w:numPr><w:ilvl w:val="${listContext.level}"/><w:numId w:val="${listContext.numId}"/></w:numPr>`
        : ''
      return `<w:p>${paragraphPropsXml(align, numPr)}${inlineToRuns(node.content)}</w:p>`
    }
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      const align = (node.attrs?.align as string) ?? 'left'
      const styleTag = `<w:pStyle w:val="${HEADING_STYLE_ID(level)}"/>`
      return `<w:p>${paragraphPropsXml(align, styleTag)}${inlineToRuns(node.content)}</w:p>`
    }
    case 'bullet_list':
    case 'ordered_list': {
      // A `bullet_list`/`ordered_list` reached with an existing `listContext` is itself
      // a further block inside a `list_item` of an enclosing list — i.e. a nested list.
      // It shares its parent's `numId` and moves one `w:ilvl` deeper, which is what
      // lets a reader (this app's own, or Word's) reconstruct the nesting again from
      // `w:ilvl` on import (see datei-oeffnen-req.md §6 criterion 2 and
      // docx/reader.ts's groupLists). A genuinely top-level list (no enclosing
      // listContext) allocates a fresh ilvl-0 numbering context as before.
      const nextContext: ListContext = listContext
        ? { numId: listContext.numId, level: Math.min(listContext.level + 1, MAX_LIST_ILVL) }
        : { numId: node.type === 'ordered_list' ? ORDERED_NUM_ID : BULLET_NUM_ID, level: 0 }
      return (node.content ?? [])
        .flatMap((item) => (item.content ?? []).map((child) => blockToDocx(child, images, rels, nextContext)))
        .join('')
    }
    case 'table':
      return tableToDocx(node, images, rels)
    case 'image':
      return imageParagraphXml(node, images, rels)
    case 'unsupported_block':
      // The reader used this node purely to keep otherwise-unsupported content (a
      // textbox, an embedded object) visible instead of silently dropping it (see
      // datei-oeffnen-req.md §3.13). On export there is no OOXML construct to write
      // the placeholder itself back into, so its rescued content is unwrapped and
      // written as plain blocks — losing the "unsupported" marker, but not the text,
      // which is what the round-trip requirement (§6) actually checks for.
      return (node.content ?? []).map((child) => blockToDocx(child, images, rels)).join('')
    default:
      return ''
  }
}

function tableToDocx(node: JsonNode, images: ImageCollector, rels: RelationshipRegistry): string {
  const rows = node.content ?? []
  const colCount = (rows[0]?.content ?? []).reduce((sum, cell) => sum + Number(cell.attrs?.colspan ?? 1), 0) || 1
  const grid = `<w:tblGrid>${Array.from({ length: colCount }, () => '<w:gridCol w:w="2000"/>').join('')}</w:tblGrid>`

  const pending: Array<number> = Array.from({ length: colCount }, () => 0)

  const rowsXml = rows
    .map((row) => {
      const cellsXml: string[] = []
      let col = 0
      let cellIndex = 0
      const rowCells = row.content ?? []
      while (col < colCount) {
        if (pending[col] > 0) {
          pending[col] -= 1
          cellsXml.push(`<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>`)
          col += 1
          continue
        }
        const cell = rowCells[cellIndex]
        cellIndex += 1
        if (!cell) {
          col += 1
          continue
        }
        const colspan = Number(cell.attrs?.colspan ?? 1)
        const rowspan = Number(cell.attrs?.rowspan ?? 1)
        const tcPrParts: string[] = []
        if (colspan > 1) tcPrParts.push(`<w:gridSpan w:val="${colspan}"/>`)
        if (rowspan > 1) tcPrParts.push('<w:vMerge w:val="restart"/>')
        const inner = (cell.content ?? []).map((child) => blockToDocx(child, images, rels)).join('') || '<w:p/>'
        cellsXml.push(`<w:tc>${tcPrParts.length ? `<w:tcPr>${tcPrParts.join('')}</w:tcPr>` : ''}${inner}</w:tc>`)
        if (rowspan > 1) {
          for (let c = col; c < col + colspan; c++) pending[c] = rowspan - 1
        }
        col += colspan
      }
      return `<w:tr>${cellsXml.join('')}</w:tr>`
    })
    .join('')

  return `<w:tbl><w:tblPr/>${grid}${rowsXml}</w:tbl>`
}

function blocksToDocx(content: JsonNode[] | undefined, images: ImageCollector, rels: RelationshipRegistry): string {
  return (content ?? []).map((node) => blockToDocx(node, images, rels)).join('')
}

function buildDocumentXml(bodyXml: string, sectPrExtra: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${WORD_NAMESPACE_DECLARATIONS}><w:body>${bodyXml}<w:sectPr>${sectPrExtra}</w:sectPr></w:body></w:document>`
  )
}

function buildHeaderFooterXml(tag: 'hdr' | 'ftr', bodyXml: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + `<w:${tag} ${WORD_NAMESPACE_DECLARATIONS}>${bodyXml}</w:${tag}>`
  )
}

function buildCorePropsXml(title: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    `</cp:coreProperties>`
  )
}

function buildContentTypesXml(hasHeader: boolean, hasFooter: boolean, images: CollectedImage[]): string {
  const imageDefaults = Array.from(new Set(images.map((img) => img.extension)))
    .map((ext) => `<Default Extension="${ext}" ContentType="image/${ext === 'jpg' ? 'jpeg' : ext}"/>`)
    .join('')
  const overrides = [
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`,
    `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`,
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
    hasHeader ? `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` : '',
    hasFooter ? `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` : '',
  ].join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    imageDefaults +
    overrides +
    `</Types>`
  )
}

export async function writeDocx(doc: WordDocumentContent): Promise<Blob> {
  const images = new ImageCollector()
  const documentRels = new RelationshipRegistry()

  const bodyXml = blocksToDocx((doc.body as unknown as { content: JsonNode[] }).content, images, documentRels)

  const header = doc.header as unknown as { content: JsonNode[] } | null
  const footer = doc.footer as unknown as { content: JsonNode[] } | null

  let sectPrExtra = ''
  let headerXml: string | null = null
  let footerXml: string | null = null
  if (header) {
    headerXml = buildHeaderFooterXml('hdr', blocksToDocx(header.content, images, documentRels))
    const relId = documentRels.add(RELATIONSHIP_TYPES.header, 'header1.xml')
    sectPrExtra += `<w:headerReference w:type="default" r:id="${relId}"/>`
  }
  if (footer) {
    footerXml = buildHeaderFooterXml('ftr', blocksToDocx(footer.content, images, documentRels))
    const relId = documentRels.add(RELATIONSHIP_TYPES.footer, 'footer1.xml')
    sectPrExtra += `<w:footerReference w:type="default" r:id="${relId}"/>`
  }

  sectPrExtra += defaultPageSetupXml()

  documentRels.add(RELATIONSHIP_TYPES.styles, 'styles.xml')
  documentRels.add(RELATIONSHIP_TYPES.numbering, 'numbering.xml')

  const documentXml = buildDocumentXml(bodyXml, sectPrExtra)
  const stylesXml = headingStylesXml()
  const numberingXmlContent = numberingXml()
  const coreXml = buildCorePropsXml(doc.meta.title)

  const rootRels = new RelationshipRegistry()
  rootRels.add(RELATIONSHIP_TYPES.officeDocument, 'word/document.xml')
  rootRels.add(RELATIONSHIP_TYPES.coreProperties, 'docProps/core.xml')

  const zip = new JSZip()
  zip.file('[Content_Types].xml', buildContentTypesXml(!!header, !!footer, images.all()))
  zip.folder('_rels')!.file('.rels', rootRels.serialize())
  zip.folder('docProps')!.file('core.xml', coreXml)
  const wordFolder = zip.folder('word')!
  wordFolder.file('document.xml', documentXml)
  wordFolder.file('styles.xml', stylesXml)
  wordFolder.file('numbering.xml', numberingXmlContent)
  if (headerXml) wordFolder.file('header1.xml', headerXml)
  if (footerXml) wordFolder.file('footer1.xml', footerXml)
  wordFolder.folder('_rels')!.file('document.xml.rels', documentRels.serialize())
  if (images.all().length) {
    const media = wordFolder.folder('media')!
    for (const image of images.all()) {
      media.file(image.fileName.split('/').pop()!, image.base64, { base64: true })
    }
  }

  // Must run after every zip.file()/zip.folder() call above and right before
  // generateAsync(), so the archive's bytes depend only on document content, not on the
  // wall-clock moment the export happened to run (see speichern-exportieren-qa.md
  // Testfall 11 / zipDeterminism.ts).
  stampZipEntriesForDeterminism(zip)

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  })
}
