export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const ODF_NAMESPACES = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  dc: 'http://purl.org/dc/elements/1.1/',
  meta: 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
} as const

export const NAMESPACE_DECLARATIONS = `xmlns:office="${ODF_NAMESPACES.office}" xmlns:style="${ODF_NAMESPACES.style}" xmlns:text="${ODF_NAMESPACES.text}" xmlns:table="${ODF_NAMESPACES.table}" xmlns:draw="${ODF_NAMESPACES.draw}" xmlns:fo="${ODF_NAMESPACES.fo}" xmlns:xlink="${ODF_NAMESPACES.xlink}" xmlns:svg="${ODF_NAMESPACES.svg}" xmlns:dc="${ODF_NAMESPACES.dc}" xmlns:meta="${ODF_NAMESPACES.meta}"`

export function parseXmlDocument(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const errorNode = doc.getElementsByTagName('parsererror')[0]
  if (errorNode) {
    throw new Error(`Ungültiges XML: ${errorNode.textContent}`)
  }
  return doc
}
