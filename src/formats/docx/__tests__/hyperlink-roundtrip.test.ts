import JSZip from 'jszip'
import { writeDocx } from '../writer'
import { readDocx } from '../reader'
import type { WordDocumentContent } from '../../shared/documentModel'

// hyperlink-einfuegen-req.md: DOCX-Schreibpfad (§0.6) — verlinkte Runs werden in
// <w:hyperlink r:id> mit External-Relationship gewrappt; zusammen mit dem Import
// (hyperlink-import.test.ts) ist die DOCX-Rundreise damit link-erhaltend.

function doc(content: unknown[]): WordDocumentContent {
  return { body: { type: 'doc', content }, header: null, footer: null, meta: { title: '' } }
}

type InlineNode = { text?: string; marks?: Array<{ type: string; attrs?: { href?: string } }> }

describe('DOCX-Rundreise: Hyperlink', () => {
  it('schreibt w:hyperlink + External-Relationship (escaped) und liest das link-Mark zurück', async () => {
    const original = doc([
      {
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [
          { type: 'text', text: 'siehe ' },
          { type: 'text', text: 'Beispiel', marks: [{ type: 'link', attrs: { href: 'https://example.test/?a=1&b=2' } }] },
          { type: 'text', text: ' hier' },
        ],
      },
    ])
    const blob = await writeDocx(original)
    const zip = await JSZip.loadAsync(blob)
    const documentXml = await zip.file('word/document.xml')!.async('text')
    const relsXml = await zip.file('word/_rels/document.xml.rels')!.async('text')
    expect(documentXml).toMatch(/<w:hyperlink r:id="rId\d+" w:history="1"><w:r><w:t>Beispiel<\/w:t><\/w:r><\/w:hyperlink>/)
    expect(relsXml).toContain('Target="https://example.test/?a=1&amp;b=2" TargetMode="External"')

    const result = await readDocx(blob)
    const para = (result.body as { content: Array<{ content: InlineNode[] }> }).content[0]
    const linked = para.content.find((n) => n.marks?.some((m) => m.type === 'link'))
    expect(linked?.text).toBe('Beispiel')
    expect(linked?.marks?.find((m) => m.type === 'link')?.attrs?.href).toBe('https://example.test/?a=1&b=2')
    expect(para.content.filter((n) => n.marks?.some((m) => m.type === 'link'))).toHaveLength(1)
  })

  it('teilweise fetter Link: EIN w:hyperlink mit EINER Relationship, beide Marks überleben', async () => {
    const href = 'https://example.test/'
    const original = doc([
      {
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [
          { type: 'text', text: 'normal', marks: [{ type: 'link', attrs: { href } }] },
          { type: 'text', text: 'fett', marks: [{ type: 'strong' }, { type: 'link', attrs: { href } }] },
        ],
      },
    ])
    const blob = await writeDocx(original)
    const documentXml = await (await JSZip.loadAsync(blob)).file('word/document.xml')!.async('text')
    expect(documentXml.match(/<w:hyperlink /g)).toHaveLength(1)

    const result = await readDocx(blob)
    const para = (result.body as { content: Array<{ content: InlineNode[] }> }).content[0]
    const bold = para.content.find((n) => n.marks?.some((m) => m.type === 'strong'))
    expect(bold?.text).toBe('fett')
    expect(bold?.marks?.some((m) => m.type === 'link')).toBe(true)
  })
})
