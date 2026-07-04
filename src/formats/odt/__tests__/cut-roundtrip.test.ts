import { writeOdt } from '../writer'
import { readOdt } from '../reader'
import JSZip from 'jszip'
import type { WordDocumentContent } from '../../shared/documentModel'

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function doc(content: unknown[]): WordDocumentContent {
  return { body: { type: 'doc', content }, header: null, footer: null, meta: { title: '' } }
}
function paragraph(text: string) {
  return { type: 'paragraph', attrs: { align: 'left' }, content: text ? [{ type: 'text', text }] : [] }
}
async function roundTrip(content: WordDocumentContent): Promise<WordDocumentContent> {
  return readOdt(await writeOdt(content))
}

describe('ODT Rundreise: Zustand "nach Ausschneiden" (Req 4.2)', () => {
  it('Testfall 2/3: zusammengeführter Absatz bleibt sauber, übriger Inhalt unverändert', async () => {
    const postCut = doc([paragraph('Vorher Nachher'), paragraph('Unveränderter Absatz danach')])
    const result = await roundTrip(postCut)
    const paragraphs = (result.body as any).content
    expect(paragraphs[0].content[0].text).toBe('Vorher Nachher')
    expect(paragraphs[1].content[0].text).toBe('Unveränderter Absatz danach')
  })

  it('Testfall 6: kein verwaister Bild-Eintrag im Manifest/Zip nach Entfernen eines Bild-Knotens', async () => {
    const withImage = doc([paragraph('Text'), { type: 'image', attrs: { src: TINY_PNG, alt: 'Diagramm' } }])
    const zipWithImage = await JSZip.loadAsync(await writeOdt(withImage))
    const manifestWithImage = await zipWithImage.file('META-INF/manifest.xml')!.async('text')
    expect(manifestWithImage).toContain('media-type="image/png"')

    const afterCut = doc([paragraph('Text')])
    const zipAfterCut = await JSZip.loadAsync(await writeOdt(afterCut))
    const manifestAfterCut = await zipAfterCut.file('META-INF/manifest.xml')!.async('text')
    expect(manifestAfterCut).not.toContain('media-type="image/png"')
    const imageFilesAfterCut = Object.keys(zipAfterCut.files).filter((p) => /\.(png|jpe?g|gif)$/i.test(p))
    expect(imageFilesAfterCut).toHaveLength(0)
  })

  it('Testfall 7: geleerte Tabellenzelle — Zeilen/Spalten/colspan unverändert', async () => {
    const postCut = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('')] },
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('bleibt')] },
            ],
          },
        ],
      },
    ])
    const result = await roundTrip(postCut)
    const table = (result.body as any).content[0]
    expect(table.content[0].content).toHaveLength(2)
  })

  it('Testfall 8: vollständig ausgeschnittene Liste — keine Listenreste', async () => {
    const postCut = doc([paragraph('Davor'), paragraph('Danach')])
    const result = await roundTrip(postCut)
    const types = (result.body as any).content.map((n: any) => n.type)
    expect(types).toEqual(['paragraph', 'paragraph'])
  })

  it('Testfall 10: komplett geleertes Dokument exportiert/reimportiert als valide leere Datei', async () => {
    const postCut = doc([paragraph('')])
    const result = await roundTrip(postCut)
    const resultContent = (result.body as any).content
    expect(resultContent).toHaveLength(1)
    expect(resultContent[0].type).toBe('paragraph')
    expect(resultContent[0].attrs).toEqual({ align: 'left' })
    // ProseMirrors Node.toJSON() lässt den "content"-Schlüssel bei einem leeren
    // Knoten ganz weg (statt eines leeren Arrays) — funktional äquivalent leer,
    // siehe documentModel.ts emptyDocJSON(), die dasselbe Muster verwendet.
    expect(resultContent[0].content ?? []).toEqual([])
  })
})

describe('ODT Rundreise: Cross-Format nach Ausschneiden (Req 4.2 Testfall 4/5)', () => {
  it('DOCX → (Ausschneiden simuliert) → ODT → reimportiert: Inhalt abzüglich Ausgeschnittenem bleibt konsistent', async () => {
    const { writeDocx } = await import('../../docx/writer')
    const { readDocx } = await import('../../docx/reader')
    const postCut = doc([paragraph('Rest nach Ausschneiden')])

    const asDocxBlob = await writeDocx(postCut)
    const viaDocx = await readDocx(asDocxBlob)
    const backToOdtBlob = await writeOdt(viaDocx)
    const final = await readOdt(backToOdtBlob)

    expect((final.body as any).content[0].content[0].text).toBe('Rest nach Ausschneiden')
  })
})
