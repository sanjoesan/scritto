import JSZip from 'jszip'
import type { WordDocumentContent } from '../shared/documentModel'
import { escapeXml, NAMESPACE_DECLARATIONS } from './xmlUtil'
import {
  TextStyleRegistry,
  PARAGRAPH_ALIGN_STYLE_NAME,
  paragraphAlignStyleDefs,
  headingStyleDefs,
  headingStyleName,
  listStyleDefs,
  BULLET_LIST_STYLE_NAME,
  ORDERED_LIST_STYLE_NAME,
  type RunProps,
} from './styleRegistry'
import { ImageCollector, type CollectedImage } from './imageCollector'
import { PAGE_WIDTH_MM, PAGE_HEIGHT_MM, PAGE_MARGIN_MM } from '../shared/pageGeometry'
import { stampZipEntriesForDeterminism } from '../shared/zipDeterminism'
import { imageFallbackText, isEmbeddableImageSrc } from '../shared/imageFallback'

/** ODF measures page geometry in cm; renders e.g. 25 -> "2.5cm", 210 -> "21cm". */
function mmToCm(mm: number): string {
  return `${(mm / 10).toFixed(1).replace(/\.0$/, '')}cm`
}

interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
}

function runPropsFromMarks(marks: JsonNode['marks']): RunProps {
  const props: RunProps = {}
  for (const mark of marks ?? []) {
    if (mark.type === 'strong') props.bold = true
    if (mark.type === 'em') props.italic = true
    if (mark.type === 'underline') props.underline = true
    if (mark.type === 'strike') props.strike = true
    if (mark.type === 'textColor') props.color = mark.attrs?.color as string
    if (mark.type === 'highlight') props.highlight = mark.attrs?.color as string
  }
  return props
}

/**
 * Generates deterministic, sequential `table:name` values ("Table1", "Table2", ...).
 * The previous implementation used `Math.random()`, which made two exports of the very
 * same, unchanged document byte-different whenever it contained a table — violating the
 * "two consecutive exports are byte/content-identical" requirement
 * (speichern-exportieren-qa.md Testfall 11). `table:name` merely has to be unique within
 * the package; `readOdt` never reads it back, so a plain incrementing sequence (shared
 * across body/header/footer so names stay unique document-wide) is sufficient.
 */
class TableNameSequence {
  private count = 0
  next(): string {
    this.count += 1
    return `Table${this.count}`
  }
}

function encodeWhitespace(text: string): string {
  return escapeXml(text).replace(/\t/g, '<text:tab/>').replace(/ {2,}/g, (run) => {
    // ODF only preserves a single leading/following space; runs of extra spaces
    // need explicit <text:s/> markers to survive a round trip.
    return ' ' + '<text:s/>'.repeat(run.length - 1)
  })
}

function inlineToOdt(nodes: JsonNode[] | undefined, styles: TextStyleRegistry): string {
  if (!nodes) return ''
  return nodes
    .map((node) => {
      if (node.type === 'hard_break') return '<text:line-break/>'
      if (node.type === 'text') {
        const text = encodeWhitespace(node.text ?? '')
        const styleName = styles.styleNameFor(runPropsFromMarks(node.marks))
        return styleName ? `<text:span text:style-name="${styleName}">${text}</text:span>` : text
      }
      return ''
    })
    .join('')
}

function blockToOdt(node: JsonNode, styles: TextStyleRegistry, images: ImageCollector, tableNames: TableNameSequence): string {
  switch (node.type) {
    case 'paragraph': {
      const align = (node.attrs?.align as string) ?? 'left'
      const styleName = PARAGRAPH_ALIGN_STYLE_NAME[align] ?? PARAGRAPH_ALIGN_STYLE_NAME.left
      const inner = inlineToOdt(node.content, styles)
      return `<text:p text:style-name="${styleName}">${inner}</text:p>`
    }
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      const align = (node.attrs?.align as string) ?? 'left'
      const inner = inlineToOdt(node.content, styles)
      return `<text:h text:style-name="${headingStyleName(level, align)}" text:outline-level="${level}">${inner}</text:h>`
    }
    case 'bullet_list':
    case 'ordered_list': {
      const listStyleName = node.type === 'ordered_list' ? ORDERED_LIST_STYLE_NAME : BULLET_LIST_STYLE_NAME
      const items = (node.content ?? [])
        .map((item) => {
          const inner = (item.content ?? []).map((child) => blockToOdt(child, styles, images, tableNames)).join('')
          return `<text:list-item>${inner}</text:list-item>`
        })
        .join('')
      return `<text:list text:style-name="${listStyleName}">${items}</text:list>`
    }
    case 'table': {
      const rows = node.content ?? []
      // Column count must be the *sum* of the first row's colspans, not merely the
      // number of cell nodes — a colspan>1 cell in the first row would otherwise
      // under-declare `table:table-column`s (see speichern-exportieren-code.md 1.4).
      const colCount =
        (rows[0]?.content ?? []).reduce((sum, cell) => sum + Number(cell.attrs?.colspan ?? 1), 0) || 1
      const columns = Array.from({ length: colCount }, () => '<table:table-column/>').join('')

      // ODF 1.3 §9.1.1 requires every row to declare exactly `colCount` cell
      // elements — unlike OOXML's `w:gridSpan`, a `table:number-columns-spanned`
      // does *not* reduce how many table-cell/covered-table-cell elements the row
      // needs. `pending` tracks, per grid column, how many more rows must emit a
      // `<table:covered-table-cell/>` there because an earlier row's cell has a
      // rowspan reaching into them (mirrors the equivalent `pending` tracker in
      // docx/writer.ts::tableToDocx, adapted for ODF's per-row-full-grid rule).
      const pending: number[] = Array.from({ length: colCount }, () => 0)

      const rowsXml = rows
        .map((row) => {
          const cellsXml: string[] = []
          let col = 0
          let cellIndex = 0
          const rowCells = row.content ?? []
          while (col < colCount) {
            if (pending[col] > 0) {
              pending[col] -= 1
              cellsXml.push('<table:covered-table-cell/>')
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
            const spanAttrs = [
              colspan > 1 ? `table:number-columns-spanned="${colspan}"` : '',
              rowspan > 1 ? `table:number-rows-spanned="${rowspan}"` : '',
            ]
              .filter(Boolean)
              .join(' ')
            const inner = (cell.content ?? []).map((child) => blockToOdt(child, styles, images, tableNames)).join('')
            cellsXml.push(`<table:table-cell ${spanAttrs}>${inner || '<text:p/>'}</table:table-cell>`)
            // Horizontal coverage: the (colspan - 1) grid columns to the right of this
            // cell, within this same row, get a covered-table-cell instead of another
            // real cell.
            for (let c = col + 1; c < col + colspan; c++) {
              cellsXml.push('<table:covered-table-cell/>')
            }
            // Vertical coverage: mark the columns this cell spans so the next
            // (rowspan - 1) rows emit covered-table-cell at the same grid positions.
            if (rowspan > 1) {
              for (let c = col; c < col + colspan; c++) pending[c] = rowspan - 1
            }
            col += colspan
          }
          return `<table:table-row>${cellsXml.join('')}</table:table-row>`
        })
        .join('')
      const tableName = tableNames.next()
      return `<table:table table:name="${tableName}">${columns}${rowsXml}</table:table>`
    }
    case 'image': {
      const src = String(node.attrs?.src ?? '')
      if (!isEmbeddableImageSrc(src)) {
        // A non-data-URL image must never abort the export (einfuegen-req.md
        // 0.7/3.12, Live-Bug) — emit visible placeholder text instead.
        return `<text:p>${escapeXml(imageFallbackText(String(node.attrs?.alt ?? '')))}</text:p>`
      }
      const fileName = images.add(src)
      const width = node.attrs?.width ? `${node.attrs.width}px` : '6cm'
      const height = node.attrs?.height ? `${node.attrs.height}px` : '4cm'
      const alt = escapeXml(String(node.attrs?.alt ?? ''))
      return `<text:p><draw:frame draw:name="${alt || 'Image'}" svg:width="${width}" svg:height="${height}" text:anchor-type="as-char"><draw:image xlink:href="${fileName}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`
    }
    case 'unsupported_block':
      // The reader used this node purely to keep otherwise-unsupported content (a
      // textbox, an embedded object) visible instead of silently dropping it (see
      // datei-oeffnen-req.md §3.13). On export there is no ODF construct to write the
      // placeholder itself back into, so its rescued content is unwrapped and written
      // as plain blocks — losing the "unsupported" marker, but not the text, which is
      // what the round-trip requirement (§6) actually checks for.
      return (node.content ?? []).map((child) => blockToOdt(child, styles, images, tableNames)).join('')
    default:
      return ''
  }
}

function blocksToOdt(
  content: JsonNode[] | undefined,
  styles: TextStyleRegistry,
  images: ImageCollector,
  tableNames: TableNameSequence,
): string {
  return (content ?? []).map((node) => blockToOdt(node, styles, images, tableNames)).join('')
}

function buildContentXml(bodyXml: string, styles: TextStyleRegistry): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-content ${NAMESPACE_DECLARATIONS} office:version="1.3">` +
    `<office:automatic-styles>${paragraphAlignStyleDefs()}${headingStyleDefs()}${listStyleDefs()}${styles.serializeDefs()}</office:automatic-styles>` +
    `<office:body><office:text>${bodyXml}</office:text></office:body>` +
    `</office:document-content>`
  )
}

function buildStylesXml(headerXml: string | null, footerXml: string | null, styles: TextStyleRegistry): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-styles ${NAMESPACE_DECLARATIONS} office:version="1.3">` +
    `<office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles>` +
    `<office:automatic-styles>` +
    `<style:page-layout style:name="PL1"><style:page-layout-properties fo:margin="${mmToCm(PAGE_MARGIN_MM)}" fo:page-width="${mmToCm(PAGE_WIDTH_MM)}" fo:page-height="${mmToCm(PAGE_HEIGHT_MM)}"/></style:page-layout>` +
    `${styles.serializeDefs()}` +
    `</office:automatic-styles>` +
    `<office:master-styles>` +
    `<style:master-page style:name="Standard" style:page-layout-name="PL1">` +
    (headerXml !== null ? `<style:header>${headerXml}</style:header>` : '') +
    (footerXml !== null ? `<style:footer>${footerXml}</style:footer>` : '') +
    `</style:master-page>` +
    `</office:master-styles>` +
    `</office:document-styles>`
  )
}

function buildMetaXml(title: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-meta ${NAMESPACE_DECLARATIONS} office:version="1.3">` +
    `<office:meta><dc:title>${escapeXml(title)}</dc:title></office:meta>` +
    `</office:document-meta>`
  )
}

function buildManifestXml(images: CollectedImage[]): string {
  const entries = images
    .map((img) => `<manifest:file-entry manifest:full-path="${img.fileName}" manifest:media-type="${img.mimeType}"/>`)
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
    `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
    `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>` +
    `<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>` +
    entries +
    `</manifest:manifest>`
  )
}

export async function writeOdt(doc: WordDocumentContent): Promise<Blob> {
  const bodyStyles = new TextStyleRegistry()
  const images = new ImageCollector()
  // Shared across body/header/footer so every table in the document gets a unique,
  // deterministic name (see TableNameSequence above).
  const tableNames = new TableNameSequence()
  const bodyXml = blocksToOdt((doc.body as unknown as JsonNode).content, bodyStyles, images, tableNames)

  const chromeStyles = new TextStyleRegistry()
  const header = doc.header as unknown as JsonNode | null
  const footer = doc.footer as unknown as JsonNode | null
  const headerXml = header ? blocksToOdt(header.content, chromeStyles, images, tableNames) : null
  const footerXml = footer ? blocksToOdt(footer.content, chromeStyles, images, tableNames) : null

  const contentXml = buildContentXml(bodyXml, bodyStyles)
  const stylesXml = buildStylesXml(headerXml, footerXml, chromeStyles)
  const metaXml = buildMetaXml(doc.meta.title)
  const manifestXml = buildManifestXml(images.all())

  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.folder('META-INF')!.file('manifest.xml', manifestXml)
  zip.file('content.xml', contentXml)
  zip.file('styles.xml', stylesXml)
  zip.file('meta.xml', metaXml)
  for (const image of images.all()) {
    zip.file(image.fileName, image.base64, { base64: true })
  }

  // Must run after every zip.file()/zip.folder() call above and right before
  // generateAsync(), so the archive's bytes depend only on document content, not on the
  // wall-clock moment the export happened to run (see speichern-exportieren-qa.md
  // Testfall 11 / zipDeterminism.ts). Only touches each entry's `date`, not its
  // per-file compression setting, so it does not affect the `mimetype` STORE override
  // below.
  stampZipEntriesForDeterminism(zip)

  // `mimetype` above is explicitly written with `{ compression: 'STORE' }` per file,
  // which — per the ODF spec — must stay uncompressed and remain the first zip entry;
  // that per-file setting takes precedence over this global default and is untouched.
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.oasis.opendocument.text',
    compression: 'DEFLATE',
  })
}
