import JSZip from 'jszip'
import { readDocx } from '../reader'

// hyperlink-einfuegen-req.md §0.4: <w:hyperlink r:id> behielt bisher nur den sichtbaren
// Text — das über die Relationship aufgelöste Ziel wird jetzt als link-Mark übernommen.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

async function buildLinkDocx(): Promise<Blob> {
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>` +
    `<w:p><w:r><w:t xml:space="preserve">siehe </w:t></w:r>` +
    `<w:hyperlink r:id="rId7"><w:r><w:rPr><w:b/></w:rPr><w:t>Beispielseite</w:t></w:r></w:hyperlink>` +
    `<w:r><w:t xml:space="preserve"> hier</w:t></w:r></w:p>` +
    // w:anchor-only (internes Sprungziel, laut req außerhalb des Scopes): Text bleibt, KEIN Link
    `<w:p><w:hyperlink w:anchor="Textmarke1"><w:r><w:t>intern</w:t></w:r></w:hyperlink></w:p>` +
    `<w:sectPr/></w:body></w:document>`
  const documentRels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId7" Type="${R}/hyperlink" Target="https://example.test/?x=1&amp;y=2" TargetMode="External"/>` +
    `</Relationships>`
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`,
  )
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
  )
  const word = zip.folder('word')!
  word.file('document.xml', documentXml)
  word.folder('_rels')!.file('document.xml.rels', documentRels)
  return zip.generateAsync({ type: 'blob' })
}

type InlineNode = { text?: string; marks?: Array<{ type: string; attrs?: { href?: string } }> }

describe('DOCX-Import: Hyperlink-Ziel wird als link-Mark übernommen (§0.4)', () => {
  it('externer Link: href aufgelöst (inkl. &-Query), rPr-Marks bleiben, Umgebung unverlinkt', async () => {
    const result = await readDocx(await buildLinkDocx())
    const paragraphs = (result.body as { content: Array<{ content: InlineNode[] }> }).content

    const linked = paragraphs[0].content.find((n) => n.marks?.some((m) => m.type === 'link'))
    expect(linked?.text).toBe('Beispielseite')
    expect(linked?.marks?.find((m) => m.type === 'link')?.attrs?.href).toBe('https://example.test/?x=1&y=2')
    expect(linked?.marks?.some((m) => m.type === 'strong'), 'rPr-Formatierung im Link bleibt erhalten').toBe(true)
    expect(paragraphs[0].content.filter((n) => n.marks?.some((m) => m.type === 'link'))).toHaveLength(1)
  })

  it('w:anchor-Hyperlink (internes Sprungziel): Text bleibt, kein link-Mark', async () => {
    const result = await readDocx(await buildLinkDocx())
    const paragraphs = (result.body as { content: Array<{ content: InlineNode[] }> }).content
    const internal = paragraphs[1].content[0]
    expect(internal.text).toBe('intern')
    expect(internal.marks?.some((m) => m.type === 'link') ?? false).toBe(false)
  })
})

// Reale Word-Fixture (req §0.10): bug65738.docx trägt externe Links (rId7–rId10) UND
// interne w:anchor-Sprungziele in einer Datei — der wertvollste Einzelnachweis für
// beide Zweige des neuen Hyperlink-Imports.
describe('DOCX-Import: reale Fixture bug65738.docx', () => {
  it('externe Links kommen mit aufgelöstem, wohlgeformtem Ziel an', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const buffer = readFileSync(join(__dirname, '../../../../tests/fixtures/external/docx/bug65738.docx'))
    const result = await readDocx(buffer as unknown as Blob)
    const hrefs = new Set<string>()
    const visit = (node: { marks?: Array<{ type: string; attrs?: { href?: string } }>; content?: unknown[] }) => {
      node.marks?.forEach((m) => {
        if (m.type === 'link' && m.attrs?.href) hrefs.add(m.attrs.href)
      })
      ;(node.content as Array<Record<string, unknown>> | undefined)?.forEach((c) => visit(c as never))
    }
    ;(result.body as { content: Array<Record<string, unknown>> }).content.forEach((n) => visit(n as never))
    expect(hrefs.size).toBeGreaterThanOrEqual(1)
    for (const href of hrefs) {
      expect(href, 'kein interner Paketpfad als Linkziel').toMatch(/^(https?:|mailto:)/)
    }
  })
})
