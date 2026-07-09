import JSZip from 'jszip'
import { writeOdt } from '../writer'
import { readOdt } from '../reader'
import type { WordDocumentContent } from '../../shared/documentModel'

// hyperlink-einfuegen-req.md — Datenmodell-/ODT-Scheibe: das link-Mark übersteht die
// ODT-Rundreise als <text:a xlink:href>; vorher wurde das href beim Import verworfen
// (§0.5) und es gab gar keinen Schreibpfad (§0.8).

function doc(content: unknown[]): WordDocumentContent {
  return { body: { type: 'doc', content }, header: null, footer: null, meta: { title: '' } }
}

const LINKED_PARAGRAPH = {
  type: 'paragraph',
  attrs: { align: 'left' },
  content: [
    { type: 'text', text: 'siehe ' },
    { type: 'text', text: 'Beispielseite', marks: [{ type: 'link', attrs: { href: 'https://example.test/pfad?a=1&b=2' } }] },
    { type: 'text', text: ' hier' },
  ],
}

describe('ODT-Rundreise: Hyperlink', () => {
  it('schreibt text:a mit escaptem xlink:href und liest das link-Mark zurück', async () => {
    const blob = await writeOdt(doc([LINKED_PARAGRAPH]))
    const xml = await (await JSZip.loadAsync(blob)).file('content.xml')!.async('text')
    expect(xml).toContain('xlink:href="https://example.test/pfad?a=1&amp;b=2"')
    expect(xml).toContain('<text:a xlink:type="simple"')

    const result = await readOdt(blob)
    const para = (result.body as { content: Array<{ content: Array<{ text?: string; marks?: Array<{ type: string; attrs?: { href?: string } }> }> }> }).content[0]
    const linked = para.content.find((n) => n.marks?.some((m) => m.type === 'link'))
    expect(linked?.text).toBe('Beispielseite')
    expect(linked?.marks?.find((m) => m.type === 'link')?.attrs?.href).toBe('https://example.test/pfad?a=1&b=2')
    // Umgebung bleibt unverlinkt
    expect(para.content.filter((n) => n.marks?.some((m) => m.type === 'link'))).toHaveLength(1)
  })

  it('Link + Fett kombiniert: beide Marks überleben', async () => {
    const original = doc([
      {
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [
          {
            type: 'text',
            text: 'fettlink',
            marks: [{ type: 'strong' }, { type: 'link', attrs: { href: 'https://example.test/' } }],
          },
        ],
      },
    ])
    const result = await readOdt(await writeOdt(original))
    const node = (result.body as { content: Array<{ content: Array<{ marks?: Array<{ type: string }> }> }> }).content[0].content[0]
    const types = (node.marks ?? []).map((m) => m.type).sort()
    expect(types).toEqual(['link', 'strong'])
  })
})
