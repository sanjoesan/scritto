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

function blockToOdt(node: JsonNode, styles: TextStyleRegistry, images: ImageCollector): string {
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
          const inner = (item.content ?? []).map((child) => blockToOdt(child, styles, images)).join('')
          return `<text:list-item>${inner}</text:list-item>`
        })
        .join('')
      return `<text:list text:style-name="${listStyleName}">${items}</text:list>`
    }
    case 'table': {
      const rows = node.content ?? []
      const colCount = rows[0]?.content?.length ?? 1
      const columns = Array.from({ length: colCount }, () => '<table:table-column/>').join('')
      const rowsXml = rows
        .map((row) => {
          const cells = (row.content ?? [])
            .map((cell) => {
              const colspan = Number(cell.attrs?.colspan ?? 1)
              const rowspan = Number(cell.attrs?.rowspan ?? 1)
              const spanAttrs = [
                colspan > 1 ? `table:number-columns-spanned="${colspan}"` : '',
                rowspan > 1 ? `table:number-rows-spanned="${rowspan}"` : '',
              ]
                .filter(Boolean)
                .join(' ')
              const inner = (cell.content ?? []).map((child) => blockToOdt(child, styles, images)).join('')
              return `<table:table-cell ${spanAttrs}>${inner || '<text:p/>'}</table:table-cell>`
            })
            .join('')
          return `<table:table-row>${cells}</table:table-row>`
        })
        .join('')
      const tableName = `Table${Math.round(Math.random() * 1_000_000)}`
      return `<table:table table:name="${tableName}">${columns}${rowsXml}</table:table>`
    }
    case 'image': {
      const src = String(node.attrs?.src ?? '')
      const fileName = images.add(src)
      const width = node.attrs?.width ? `${node.attrs.width}px` : '6cm'
      const height = node.attrs?.height ? `${node.attrs.height}px` : '4cm'
      const alt = escapeXml(String(node.attrs?.alt ?? ''))
      return `<text:p><draw:frame draw:name="${alt || 'Image'}" svg:width="${width}" svg:height="${height}" text:anchor-type="as-char"><draw:image xlink:href="${fileName}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame></text:p>`
    }
    default:
      return ''
  }
}

function blocksToOdt(content: JsonNode[] | undefined, styles: TextStyleRegistry, images: ImageCollector): string {
  return (content ?? []).map((node) => blockToOdt(node, styles, images)).join('')
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
    `<style:page-layout style:name="PL1"><style:page-layout-properties fo:margin="2.5cm" fo:page-width="21cm" fo:page-height="29.7cm"/></style:page-layout>` +
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
  const bodyXml = blocksToOdt((doc.body as unknown as JsonNode).content, bodyStyles, images)

  const chromeStyles = new TextStyleRegistry()
  const header = doc.header as unknown as JsonNode | null
  const footer = doc.footer as unknown as JsonNode | null
  const headerXml = header ? blocksToOdt(header.content, chromeStyles, images) : null
  const footerXml = footer ? blocksToOdt(footer.content, chromeStyles, images) : null

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

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' })
}
