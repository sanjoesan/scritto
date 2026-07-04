import { writeDocx } from '../writer'
import { readDocx } from '../reader'
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
  return readDocx(await writeDocx(content))
}

describe('DOCX Rundreise: Zustand "nach Ausschneiden" (Req 4.2)', () => {
  it('Testfall 1/3: zusammengeführter Absatz nach Entfernen einer absatzübergreifenden Selektion bleibt ein sauberer Absatz, übriger Inhalt unverändert', async () => {
    // Ausgangslage vor Cut: "Vorher [SELEKTION: Rest von Absatz 1 + ganzer Absatz 2] Nachher"
    // Nach Cut simuliert der Editor bereits das Zusammenführen zu einem Absatz - hier wird
    // exakt dieser POST-CUT-Zustand als Reader/Writer-Eingabe verwendet.
    const postCut = doc([paragraph('Vorher Nachher'), paragraph('Unveränderter Absatz danach')])
    const result = await roundTrip(postCut)
    const paragraphs = (result.body as any).content
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].content[0].text).toBe('Vorher Nachher')
    // keine doppelten/verschluckten Zeichen an der Nahtstelle:
    expect(paragraphs[0].content[0].text).not.toMatch(/(.)\1{2,}/)
    expect(paragraphs[1].content[0].text).toBe('Unveränderter Absatz danach')
  })

  it('Testfall 6: kein verwaistes Bild im DOCX-Zip nach Entfernen eines Bild-Knotens', async () => {
    // Zustand "vorher" (mit Bild) — Kontrollprobe, dass das Bild bei Anwesenheit exportiert wird:
    const withImage = doc([paragraph('Text'), { type: 'image', attrs: { src: TINY_PNG, alt: 'Diagramm' } }])
    const zipWithImage = await JSZip.loadAsync(await writeDocx(withImage))
    // JSZip lists directory entries ("word/media/") alongside files under the same
    // prefix — exclude them so only actual media *files* are counted.
    const mediaFilesWithImage = Object.keys(zipWithImage.files).filter(
      (p) => p.startsWith('word/media/') && !zipWithImage.files[p].dir,
    )
    expect(mediaFilesWithImage).toHaveLength(1)

    // Zustand "nach Ausschneiden" (Bild-Knoten entfernt):
    const afterCut = doc([paragraph('Text')])
    const zipAfterCut = await JSZip.loadAsync(await writeDocx(afterCut))
    const mediaFilesAfterCut = Object.keys(zipAfterCut.files).filter(
      (p) => p.startsWith('word/media/') && !zipAfterCut.files[p].dir,
    )
    expect(mediaFilesAfterCut).toHaveLength(0)

    const result = await roundTrip(afterCut)
    const types = (result.body as any).content.map((n: any) => n.type)
    expect(types).not.toContain('image')
    expect(types).toContain('paragraph')
  })

  it('Testfall 7: geleerte Tabellenzelle (Inhalt weg, Struktur bleibt) — Zeilen/Spalten/colspan/rowspan unverändert', async () => {
    // "Zellinhalt geleert" heißt im Schema: ein leerer Absatz (cellContent: 'block+' erzwingt
    // mind. einen Block-Knoten, siehe schema.ts) statt Text — niemals ein Wegfall der Zelle selbst.
    const postCut = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('')] },
              { type: 'table_cell', attrs: { colspan: 2, rowspan: 1 }, content: [paragraph('bleibt erhalten')] },
            ],
          },
        ],
      },
    ])
    const result = await roundTrip(postCut)
    const table = (result.body as any).content[0]
    expect(table.content).toHaveLength(1) // eine Zeile, keine verschwundene <w:tr>
    expect(table.content[0].content).toHaveLength(2) // zwei Zellen, keine verschwundene Zelle
    expect(table.content[0].content[0].attrs).toMatchObject({ colspan: 1, rowspan: 1 })
    expect(table.content[0].content[1].attrs).toMatchObject({ colspan: 2, rowspan: 1 })
    expect(table.content[0].content[1].content[0].content[0].text).toBe('bleibt erhalten')
  })

  it('Testfall 8: vollständig ausgeschnittene Liste — keine leeren Listenreste, umgebende Absätze unverändert', async () => {
    const postCut = doc([paragraph('Davor'), paragraph('Danach')]) // Liste komplett entfernt
    const result = await roundTrip(postCut)
    const types = (result.body as any).content.map((n: any) => n.type)
    expect(types).toEqual(['paragraph', 'paragraph'])
    expect(types).not.toContain('bullet_list')
    expect(types).not.toContain('ordered_list')
  })

  it('Testfall 10: komplett geleertes Dokument (Strg+A → Ausschneiden) exportiert/reimportiert als valide, leere Datei', async () => {
    const postCut = doc([paragraph('')]) // Editor erzwingt mind. einen leeren Absatz (schema.ts: doc: "block+")
    const result = await roundTrip(postCut)
    expect((result.body as any).content).toHaveLength(1)
    expect((result.body as any).content[0].type).toBe('paragraph')
    // ProseMirrors Node.toJSON() lässt den "content"-Schlüssel bei einem leeren
    // Knoten ganz weg (statt eines leeren Arrays) — funktional äquivalent leer,
    // siehe documentModel.ts emptyDocJSON(), die dasselbe Muster verwendet.
    expect((result.body as any).content[0].content ?? []).toEqual([])
  })
})

describe('DOCX Rundreise: Doppel-Konvertierung nach Ausschneiden (Req 4.2 Testfall 9)', () => {
  it('bleibt nach DOCX → ODT → DOCX inhaltlich stabil', async () => {
    const { writeOdt } = await import('../../odt/writer')
    const { readOdt } = await import('../../odt/reader')
    const postCut = doc([paragraph('Verbleibender Text'), paragraph('Zweiter Absatz')])

    const asOdtBlob = await writeOdt(postCut)
    const viaOdt = await readOdt(asOdtBlob)
    const backToDocxBlob = await writeDocx(viaOdt)
    const final = await readDocx(backToDocxBlob)

    const texts = (final.body as any).content.map((p: any) => p.content[0]?.text)
    expect(texts).toEqual(['Verbleibender Text', 'Zweiter Absatz'])
  })
})
