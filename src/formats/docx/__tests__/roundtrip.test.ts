import { writeDocx } from '../writer'
import { readDocx } from '../reader'
import type { WordDocumentContent } from '../../shared/documentModel'
import {
  readZipEntryInfo,
  readZipEntryCompressionMethods,
  ZIP_COMPRESSION_DEFLATE,
  withMockedDate,
} from '../../shared/__tests__/zipInspect'

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function doc(content: unknown[]): WordDocumentContent {
  return {
    body: { type: 'doc', content },
    header: null,
    footer: null,
    meta: { title: '' },
  }
}

function paragraph(text: string, align = 'left', marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) {
  return { type: 'paragraph', attrs: { align }, content: text ? [{ type: 'text', text, marks }] : [] }
}

async function roundTrip(content: WordDocumentContent): Promise<WordDocumentContent> {
  const blob = await writeDocx(content)
  return readDocx(blob)
}

describe('DOCX round trip: headings', () => {
  it('preserves heading levels and text', async () => {
    const original = doc([
      { type: 'heading', attrs: { level: 1, align: 'left' }, content: [{ type: 'text', text: 'Titel' }] },
      { type: 'heading', attrs: { level: 2, align: 'left' }, content: [{ type: 'text', text: 'Untertitel' }] },
    ])
    const result = await roundTrip(original)
    const headings = (result.body as any).content.filter((n: any) => n.type === 'heading')
    expect(headings).toHaveLength(2)
    expect(headings[0].attrs.level).toBe(1)
    expect(headings[1].attrs.level).toBe(2)
    expect(headings[0].content[0].text).toBe('Titel')
    expect(headings[1].content[0].text).toBe('Untertitel')
  })

  it('preserves heading alignment', async () => {
    const original = doc([{ type: 'heading', attrs: { level: 1, align: 'center' }, content: [{ type: 'text', text: 'Mitte' }] }])
    const result = await roundTrip(original)
    expect((result.body as any).content[0].attrs.align).toBe('center')
  })
})

describe('DOCX round trip: paragraph alignment', () => {
  it.each(['left', 'center', 'right', 'justify'])('preserves "%s" alignment', async (align) => {
    const original = doc([paragraph('Text', align)])
    const result = await roundTrip(original)
    expect((result.body as any).content[0].attrs.align).toBe(align)
  })
})

describe('DOCX round trip: text formatting', () => {
  it('preserves bold, italic, underline, and strikethrough independently', async () => {
    const original = doc([
      {
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [
          { type: 'text', text: 'fett', marks: [{ type: 'strong' }] },
          { type: 'text', text: 'kursiv', marks: [{ type: 'em' }] },
          { type: 'text', text: 'unterstrichen', marks: [{ type: 'underline' }] },
          { type: 'text', text: 'durchgestrichen', marks: [{ type: 'strike' }] },
          { type: 'text', text: 'normal' },
        ],
      },
    ])
    const result = await roundTrip(original)
    const runs = (result.body as any).content[0].content
    expect(runs.find((r: any) => r.text === 'fett').marks).toEqual([{ type: 'strong' }])
    expect(runs.find((r: any) => r.text === 'kursiv').marks).toEqual([{ type: 'em' }])
    expect(runs.find((r: any) => r.text === 'unterstrichen').marks).toEqual([{ type: 'underline' }])
    expect(runs.find((r: any) => r.text === 'durchgestrichen').marks).toEqual([{ type: 'strike' }])
    expect(runs.find((r: any) => r.text === 'normal').marks).toBeUndefined()
  })

  it('preserves combined marks on the same run', async () => {
    const original = doc([
      {
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [{ type: 'text', text: 'fett+kursiv', marks: [{ type: 'strong' }, { type: 'em' }] }],
      },
    ])
    const result = await roundTrip(original)
    const run = (result.body as any).content[0].content[0]
    expect(run.marks).toEqual(expect.arrayContaining([{ type: 'strong' }, { type: 'em' }]))
    expect(run.marks).toHaveLength(2)
  })

  it('preserves text color and highlight color', async () => {
    const original = doc([
      {
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [
          { type: 'text', text: 'rot', marks: [{ type: 'textColor', attrs: { color: '#ff0000' } }] },
          { type: 'text', text: 'gelb markiert', marks: [{ type: 'highlight', attrs: { color: '#ffff00' } }] },
        ],
      },
    ])
    const result = await roundTrip(original)
    const runs = (result.body as any).content[0].content
    expect(runs.find((r: any) => r.text === 'rot').marks).toEqual([{ type: 'textColor', attrs: { color: '#ff0000' } }])
    expect(runs.find((r: any) => r.text === 'gelb markiert').marks).toEqual([
      { type: 'highlight', attrs: { color: '#ffff00' } },
    ])
  })

  it('preserves hard line breaks within a paragraph', async () => {
    const original = doc([
      {
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [{ type: 'text', text: 'Zeile eins' }, { type: 'hard_break' }, { type: 'text', text: 'Zeile zwei' }],
      },
    ])
    const result = await roundTrip(original)
    const content = (result.body as any).content[0].content
    expect(content.some((n: any) => n.type === 'hard_break')).toBe(true)
    expect(content.map((n: any) => n.text ?? n.type).join('|')).toBe('Zeile eins|hard_break|Zeile zwei')
  })

  it('preserves runs of multiple spaces and tab characters', async () => {
    const original = doc([paragraph('eins   zwei\tdrei')])
    const result = await roundTrip(original)
    const text = (result.body as any).content[0].content.map((n: any) => n.text).join('')
    expect(text).toBe('eins   zwei\tdrei')
  })
})

describe('DOCX round trip: lists', () => {
  it('preserves bullet lists with multiple items', async () => {
    const original = doc([
      {
        type: 'bullet_list',
        content: [
          { type: 'list_item', content: [paragraph('Erster Punkt')] },
          { type: 'list_item', content: [paragraph('Zweiter Punkt')] },
        ],
      },
    ])
    const result = await roundTrip(original)
    const list = (result.body as any).content[0]
    expect(list.type).toBe('bullet_list')
    expect(list.content).toHaveLength(2)
    expect(list.content[0].content[0].content[0].text).toBe('Erster Punkt')
  })

  it('preserves ordered lists distinctly from bullet lists', async () => {
    const original = doc([
      { type: 'ordered_list', content: [{ type: 'list_item', content: [paragraph('Schritt eins')] }] },
    ])
    const result = await roundTrip(original)
    expect((result.body as any).content[0].type).toBe('ordered_list')
  })

  it('keeps two separate lists distinct when a paragraph separates them', async () => {
    const original = doc([
      { type: 'bullet_list', content: [{ type: 'list_item', content: [paragraph('A')] }] },
      paragraph('Zwischentext'),
      { type: 'bullet_list', content: [{ type: 'list_item', content: [paragraph('B')] }] },
    ])
    const result = await roundTrip(original)
    const types = (result.body as any).content.map((n: any) => n.type)
    expect(types).toEqual(['bullet_list', 'paragraph', 'bullet_list'])
  })

  it('preserves a nested list two levels deep', async () => {
    const original = doc([
      {
        type: 'bullet_list',
        content: [
          {
            type: 'list_item',
            content: [
              paragraph('Ebene 1'),
              {
                type: 'bullet_list',
                content: [{ type: 'list_item', content: [paragraph('Ebene 2')] }],
              },
            ],
          },
        ],
      },
    ])
    const result = await roundTrip(original)
    const outerList = (result.body as any).content[0]
    expect(outerList.type).toBe('bullet_list')
    const outerItem = outerList.content[0]
    expect(outerItem.content[0].content[0].text).toBe('Ebene 1')
    const nestedList = outerItem.content.find((n: any) => n.type === 'bullet_list')
    expect(nestedList).toBeTruthy()
    expect(nestedList.content[0].content[0].content[0].text).toBe('Ebene 2')
  })
})

describe('DOCX round trip: unsupported_block', () => {
  it('keeps rescued content of an unsupported_block visible after a write/read cycle', async () => {
    const original = doc([
      {
        type: 'unsupported_block',
        attrs: { kind: 'textbox' },
        content: [paragraph('Text aus dem Textfeld')],
      },
    ])
    const result = await roundTrip(original)
    const text = JSON.stringify(result.body)
    expect(text).toContain('Text aus dem Textfeld')
  })
})

describe('DOCX round trip: negative case (external image URL)', () => {
  it('throws a readable error instead of silently dropping an image with a non-data: src', async () => {
    const original = doc([{ type: 'image', attrs: { src: 'https://example.com/bild.png', alt: '' } }])
    await expect(writeDocx(original)).rejects.toThrow(/data-URL/)
  })
})

describe('DOCX round trip: tables', () => {
  it('preserves rows, columns, and cell text', async () => {
    const original = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('A1')] },
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('B1')] },
            ],
          },
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('A2')] },
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('B2')] },
            ],
          },
        ],
      },
    ])
    const result = await roundTrip(original)
    const table = (result.body as any).content[0]
    expect(table.type).toBe('table')
    expect(table.content).toHaveLength(2)
    expect(table.content[0].content).toHaveLength(2)
    expect(table.content[0].content[0].content[0].content[0].text).toBe('A1')
    expect(table.content[1].content[1].content[0].content[0].text).toBe('B2')
  })

  it('preserves merged cells (colspan)', async () => {
    const original = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [{ type: 'table_cell', attrs: { colspan: 2, rowspan: 1 }, content: [paragraph('Merged')] }],
          },
        ],
      },
    ])
    const result = await roundTrip(original)
    const cell = (result.body as any).content[0].content[0].content[0]
    expect(cell.attrs.colspan).toBe(2)
    expect(cell.content[0].content[0].text).toBe('Merged')
  })

  it('preserves vertically merged cells (rowspan)', async () => {
    const original = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 2 }, content: [paragraph('Tall')] },
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('R1C2')] },
            ],
          },
          {
            type: 'table_row',
            content: [{ type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('R2C2')] }],
          },
        ],
      },
    ])
    const result = await roundTrip(original)
    const table = (result.body as any).content[0]
    expect(table.content[0].content[0].attrs.rowspan).toBe(2)
    expect(table.content[0].content[0].content[0].content[0].text).toBe('Tall')
    expect(table.content[1].content).toHaveLength(1)
    expect(table.content[1].content[0].content[0].content[0].text).toBe('R2C2')
  })
})

describe('DOCX round trip: images', () => {
  it('preserves an embedded image as a self-contained data URL', async () => {
    const original = doc([{ type: 'image', attrs: { src: TINY_PNG, alt: 'Testbild', width: 100, height: 80 } }])
    const result = await roundTrip(original)
    const image = (result.body as any).content[0]
    expect(image.type).toBe('image')
    expect(image.attrs.src).toMatch(/^data:image\/png;base64,/)
    expect(image.attrs.src.split(',')[1]).toBe(TINY_PNG.split(',')[1])
  })

  it('splits a paragraph containing both text and an image into separate blocks', async () => {
    const original: WordDocumentContent = {
      body: {
        type: 'doc',
        content: [paragraph('Vorher'), { type: 'image', attrs: { src: TINY_PNG, alt: '' } }],
      },
      header: null,
      footer: null,
      meta: { title: '' },
    }
    const result = await roundTrip(original)
    const types = (result.body as any).content.map((n: any) => n.type)
    expect(types).toContain('image')
    expect(types).toContain('paragraph')
  })
})

describe('DOCX round trip: header, footer, and metadata', () => {
  it('preserves header and footer content', async () => {
    const original: WordDocumentContent = {
      body: { type: 'doc', content: [paragraph('Inhalt')] },
      header: { type: 'doc', content: [paragraph('Kopfzeile')] },
      footer: { type: 'doc', content: [paragraph('Fußzeile Seite')] },
      meta: { title: '' },
    }
    const result = await roundTrip(original)
    expect((result.header as any).content[0].content[0].text).toBe('Kopfzeile')
    expect((result.footer as any).content[0].content[0].text).toBe('Fußzeile Seite')
  })

  it('omits header/footer entirely when the document has none', async () => {
    const original = doc([paragraph('Nur Inhalt')])
    const result = await roundTrip(original)
    expect(result.header).toBeNull()
    expect(result.footer).toBeNull()
  })

  it('preserves the document title', async () => {
    const original: WordDocumentContent = {
      body: { type: 'doc', content: [paragraph('Inhalt')] },
      header: null,
      footer: null,
      meta: { title: 'Mein Testdokument' },
    }
    const result = await roundTrip(original)
    expect(result.meta.title).toBe('Mein Testdokument')
  })
})

describe('DOCX round trip: whole-document fidelity', () => {
  it('preserves a document combining every supported feature at once', async () => {
    const original: WordDocumentContent = {
      body: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1, align: 'left' }, content: [{ type: 'text', text: 'Bericht' }] },
          {
            type: 'paragraph',
            attrs: { align: 'justify' },
            content: [
              { type: 'text', text: 'Einleitung mit ' },
              { type: 'text', text: 'fett', marks: [{ type: 'strong' }] },
              { type: 'text', text: ' Text.' },
            ],
          },
          {
            type: 'bullet_list',
            content: [{ type: 'list_item', content: [paragraph('Punkt A')] }, { type: 'list_item', content: [paragraph('Punkt B')] }],
          },
          {
            type: 'table',
            content: [
              {
                type: 'table_row',
                content: [
                  { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('X')] },
                  { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('Y')] },
                ],
              },
            ],
          },
          { type: 'image', attrs: { src: TINY_PNG, alt: 'Diagramm' } },
        ],
      },
      header: { type: 'doc', content: [paragraph('Firma XY')] },
      footer: { type: 'doc', content: [paragraph('Seite')] },
      meta: { title: 'Gesamtbericht' },
    }

    const result = await roundTrip(original)

    expect(result.meta.title).toBe('Gesamtbericht')
    expect((result.header as any).content[0].content[0].text).toBe('Firma XY')
    expect((result.footer as any).content[0].content[0].text).toBe('Seite')
    const types = (result.body as any).content.map((n: any) => n.type)
    expect(types).toEqual(['heading', 'paragraph', 'bullet_list', 'table', 'image'])
  })
})

describe('DOCX writer: package compression (speichern-exportieren-code.md Bug 1.6)', () => {
  it('compresses the generated package with DEFLATE, not Stored', async () => {
    const blob = await writeDocx(doc([paragraph('Text zum Komprimieren, wiederholt. '.repeat(200))]))
    const buffer = Buffer.from(await blob.arrayBuffer())
    const methods = readZipEntryCompressionMethods(buffer)

    expect(methods.size).toBeGreaterThan(0)
    expect(methods.get('word/document.xml')).toBe(ZIP_COMPRESSION_DEFLATE)
    expect(methods.get('[Content_Types].xml')).toBe(ZIP_COMPRESSION_DEFLATE)

    // Independent, effect-based proof (not just the declared method byte): a highly
    // repetitive document.xml entry must actually shrink under DEFLATE, i.e. its
    // compressed size on disk is smaller than its uncompressed size.
    const info = readZipEntryInfo(buffer)
    const documentEntry = info.get('word/document.xml')!
    expect(documentEntry.uncompressedSize).toBeGreaterThan(1000)
    expect(documentEntry.compressedSize).toBeLessThan(documentEntry.uncompressedSize)
  })
})

describe('DOCX writer: export determinism (speichern-exportieren-qa.md Testfall 11)', () => {
  it('produces byte-identical output for the same document exported at two different wall-clock times', async () => {
    // Anforderung (speichern-exportieren-req.md, Abschnitt 2 & Testfall 11): two
    // consecutive exports of an unchanged document must be "inhaltlich identisch"
    // ("deterministisches Re-Export"). This test isolates the wall-clock dimension of
    // that requirement (as opposed to E2E timing, which only *sometimes* crosses a
    // timestamp boundary depending on real test execution speed — see
    // tests/e2e/save-export-lifecycle.spec.ts Testfall 11, which was observed to fail
    // intermittently for exactly this reason).
    const content = doc([paragraph('Unveraendert')])
    const blobA = await withMockedDate('2024-01-01T00:00:00Z', () => writeDocx(content))
    const blobB = await withMockedDate('2024-01-01T00:00:03Z', () => writeDocx(content))
    const bufA = Buffer.from(await blobA.arrayBuffer())
    const bufB = Buffer.from(await blobB.arrayBuffer())

    // FIXED (found during QA of speichern-exportieren, not one of Bug 1.1-1.7 in
    // speichern-exportieren-code.md): `writeDocx` used to call `zip.file(name, data)`
    // without an explicit `date` option throughout, so JSZip embedded `new Date()`
    // (the moment of the export call) into every entry's ZIP-internal last-modified
    // timestamp (2-second DOS resolution), making two exports of the identical
    // document differ in bytes whenever real time crossed that boundary between
    // clicks. writer.ts now calls stampZipEntriesForDeterminism(zip) right before
    // generateAsync(), pinning every entry's date to a fixed constant — this is now a
    // regression test, not a currently-known defect.
    expect(Buffer.compare(bufA, bufB)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// specs/kopieren-qa.md Abschnitt 1.3 — content shapes produced by copy/paste
// (kopieren-code.md Abschnitt 3.6: copy/paste inside the editor creates the
// same wordSchema nodes as typed content, so these model exactly the node
// structures a copy/paste of the referenced kopieren-req.md test cases would
// produce, and verify the DOCX reader/writer round trip loses nothing.)
// ---------------------------------------------------------------------------

describe('DOCX round trip: content shape produced by copy/paste of a partially-bold word', () => {
  it('preserves a bold/non-bold boundary that falls mid-word', async () => {
    // Entspricht kopieren-req.md Abschnitt 2.2, Testfall 3: Selektion beginnt/endet
    // mitten in einer Formatierung — hier als bereits kopiertes/eingefügtes Ergebnis
    // modelliert (zwei Runs mit exakter Zeichengrenze).
    const original = doc([
      {
        type: 'paragraph',
        attrs: { align: 'left' },
        content: [
          { type: 'text', text: 'fe', marks: [{ type: 'strong' }] },
          { type: 'text', text: 'tt' },
        ],
      },
    ])
    const result = await roundTrip(original)
    const runs = (result.body as any).content[0].content
    expect(runs.map((r: any) => r.text).join('')).toBe('fett')
    expect(runs.find((r: any) => r.text === 'fe').marks).toEqual([{ type: 'strong' }])
    expect(runs.find((r: any) => r.text === 'tt').marks ?? []).toEqual([])
  })
})

describe('DOCX round trip: mixed-blocktype selection (heading + paragraph + list), as produced by copy/paste', () => {
  it('keeps heading, paragraph, and list distinct after a combined multi-block insert', async () => {
    // kopieren-req.md Abschnitt 2.2, Testfall 4 / Abschnitt 4, Testfall 3.
    const original = doc([
      { type: 'heading', attrs: { level: 2, align: 'left' }, content: [{ type: 'text', text: 'Abschnitt' }] },
      paragraph('Fließtext.'),
      {
        type: 'bullet_list',
        content: [{ type: 'list_item', content: [paragraph('Punkt A')] }, { type: 'list_item', content: [paragraph('Punkt B')] }],
      },
    ])
    const result = await roundTrip(original)
    const types = (result.body as any).content.map((n: any) => n.type)
    expect(types).toEqual(['heading', 'paragraph', 'bullet_list'])
  })
})

describe('DOCX round trip: whole-cell table selection (as produced by a CellSelection copy/paste)', () => {
  it('preserves a table pasted as a self-contained slice, including colspan', async () => {
    // kopieren-req.md Abschnitt 3, Testfall 2 / Abschnitt 5, Grenzfall 5.
    const original = doc([
      {
        type: 'table',
        content: [
          { type: 'table_row', content: [{ type: 'table_cell', attrs: { colspan: 2, rowspan: 1 }, content: [paragraph('Kopf')] }] },
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('A2')] },
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('B2')] },
            ],
          },
        ],
      },
    ])
    const result = await roundTrip(original)
    const table = (result.body as any).content[0]
    expect(table.content[0].content[0].attrs.colspan).toBe(2)
    expect(table.content[1].content).toHaveLength(2)
  })
})

describe('DOCX round trip: an inserted-standalone image (as produced by copy/paste of an image-only selection)', () => {
  it('keeps the image isolated with no adjacent text merged in', async () => {
    // kopieren-req.md Abschnitt 5, Grenzfall 6.
    const original: WordDocumentContent = {
      body: { type: 'doc', content: [paragraph('Davor'), { type: 'image', attrs: { src: TINY_PNG, alt: '' } }, paragraph('Danach')] },
      header: null,
      footer: null,
      meta: { title: '' },
    }
    const result = await roundTrip(original)
    const types = (result.body as any).content.map((n: any) => n.type)
    expect(types).toEqual(['paragraph', 'image', 'paragraph'])
  })
})
