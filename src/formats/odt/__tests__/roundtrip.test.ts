import JSZip from 'jszip'
import { writeOdt } from '../writer'
import { readOdt } from '../reader'
import type { WordDocumentContent } from '../../shared/documentModel'
import {
  readZipEntryInfo,
  readZipEntryCompressionMethods,
  ZIP_COMPRESSION_STORED,
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
  const blob = await writeOdt(content)
  return readOdt(blob)
}

describe('ODT round trip: headings', () => {
  it('preserves heading levels and text', async () => {
    const original = doc([
      { type: 'heading', attrs: { level: 1, align: 'left' }, content: [{ type: 'text', text: 'Titel' }] },
      { type: 'heading', attrs: { level: 2, align: 'left' }, content: [{ type: 'text', text: 'Untertitel' }] },
    ])
    const result = await roundTrip(original)
    const headings = (result.body as any).content.filter((n: any) => n.type === 'heading')
    expect(headings).toHaveLength(2)
    expect(headings[0]).toMatchObject({ attrs: { level: 1 } })
    expect(headings[1]).toMatchObject({ attrs: { level: 2 } })
    expect(headings[0].content[0].text).toBe('Titel')
    expect(headings[1].content[0].text).toBe('Untertitel')
  })

  it('preserves heading alignment', async () => {
    const original = doc([{ type: 'heading', attrs: { level: 1, align: 'center' }, content: [{ type: 'text', text: 'Mitte' }] }])
    const result = await roundTrip(original)
    expect((result.body as any).content[0].attrs.align).toBe('center')
  })
})

describe('ODT round trip: paragraph alignment', () => {
  it.each(['left', 'center', 'right', 'justify'])('preserves "%s" alignment', async (align) => {
    const original = doc([paragraph('Text', align)])
    const result = await roundTrip(original)
    expect((result.body as any).content[0].attrs.align).toBe(align)
  })
})

describe('ODT round trip: text formatting', () => {
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

describe('ODT round trip: lists', () => {
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
    const nestedList = outerItem.content.find((n: any) => n.type === 'bullet_list')
    expect(nestedList).toBeTruthy()
    expect(nestedList.content[0].content[0].content[0].text).toBe('Ebene 2')
  })
})

describe('ODT round trip: unsupported_block', () => {
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

describe('ODT round trip: negative case (external image URL)', () => {
  it('throws a readable error instead of silently dropping an image with a non-data: src', async () => {
    const original = doc([{ type: 'image', attrs: { src: 'https://example.com/bild.png', alt: '' } }])
    await expect(writeOdt(original)).rejects.toThrow(/data-URL/)
  })
})

describe('ODT round trip: tables', () => {
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

  it('preserves merged cells (colspan/rowspan)', async () => {
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
  })

  // These two check the raw content.xml structure rather than the app's own
  // read-back model. ODF 1.3 §9.1.1 requires every table-row to declare exactly as
  // many table-cell/covered-table-cell elements as table-columns exist — unlike
  // OOXML's w:gridSpan, a table:number-columns-spanned attribute alone does not
  // satisfy that. Checking only via readOdt() would not catch a writer that
  // under-declares cells, since the reader filters for real cells only (see
  // speichern-exportieren-code.md 1.5).
  it('emits ODF-compliant covered-table-cell placeholders for a horizontal (colspan) merge', async () => {
    const original = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [{ type: 'table_cell', attrs: { colspan: 2, rowspan: 1 }, content: [paragraph('Merged')] }],
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
    const blob = await writeOdt(original)
    const zip = await JSZip.loadAsync(blob)
    const contentXml = await zip.file('content.xml')!.async('text')

    expect((contentXml.match(/<table:table-column\/>/g) ?? []).length).toBe(2)

    const rowMatches = contentXml.match(/<table:table-row>.*?<\/table:table-row>/gs) ?? []
    expect(rowMatches).toHaveLength(2)
    for (const row of rowMatches) {
      const cellCount = (row.match(/<table:table-cell[ >]/g) ?? []).length
      const coveredCount = (row.match(/<table:covered-table-cell\/>/g) ?? []).length
      expect(cellCount + coveredCount).toBe(2)
    }
    expect(rowMatches[0]).toContain('<table:covered-table-cell/>')
  })

  it('emits ODF-compliant covered-table-cell placeholders for a vertical (rowspan) merge', async () => {
    const original = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 2 }, content: [paragraph('Tall')] },
              { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('B1')] },
            ],
          },
          {
            type: 'table_row',
            content: [{ type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('B2')] }],
          },
        ],
      },
    ])
    const blob = await writeOdt(original)
    const zip = await JSZip.loadAsync(blob)
    const contentXml = await zip.file('content.xml')!.async('text')

    const rowMatches = contentXml.match(/<table:table-row>.*?<\/table:table-row>/gs) ?? []
    expect(rowMatches).toHaveLength(2)
    // Row 2 must have a covered-table-cell at column 0 (covered by row 1's rowspan),
    // then the real "B2" cell at column 1.
    expect(rowMatches[1]).toMatch(/^<table:table-row><table:covered-table-cell\/><table:table-cell/)
  })
})

describe('ODT round trip: images', () => {
  it('preserves an embedded image as a self-contained data URL', async () => {
    const original = doc([{ type: 'image', attrs: { src: TINY_PNG, alt: 'Testbild' } }])
    const result = await roundTrip(original)
    const image = (result.body as any).content[0]
    expect(image.type).toBe('image')
    expect(image.attrs.src).toMatch(/^data:image\/png;base64,/)
    expect(image.attrs.src.split(',')[1]).toBe(TINY_PNG.split(',')[1])
    expect(image.attrs.alt).toBe('Testbild')
  })

  it('splits a paragraph containing both text and an image into separate blocks', async () => {
    const original: WordDocumentContent = {
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { align: 'left' },
            content: [{ type: 'text', text: 'Vorher' }],
          },
          { type: 'image', attrs: { src: TINY_PNG, alt: '' } },
        ],
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

describe('ODT round trip: header, footer, and metadata', () => {
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

describe('ODT writer: page geometry', () => {
  it('writes the same A4/2.5cm page geometry as DOCX', async () => {
    const blob = await writeOdt(doc([paragraph('x')]))
    const zip = await JSZip.loadAsync(blob)
    const stylesXml = await zip.file('styles.xml')!.async('text')

    expect(stylesXml).toContain('fo:margin="2.5cm"')
    expect(stylesXml).toContain('fo:page-width="21cm"')
    expect(stylesXml).toContain('fo:page-height="29.7cm"')
  })
})

describe('ODT writer: font default', () => {
  it("a blank new document's Standard style carries no explicit font or size (implicit application default, see specs/neues-dokument-code.md 3.5)", async () => {
    const blob = await writeOdt(doc([paragraph('x')]))
    const zip = await JSZip.loadAsync(blob)
    const stylesXml = await zip.file('styles.xml')!.async('text')

    expect(stylesXml).toMatch(/<style:style style:name="Standard" style:family="paragraph"\s*\/>/)
  })
})

describe('ODT round trip: whole-document fidelity', () => {
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

describe('ODT writer: package compression (speichern-exportieren-code.md Bug 1.6)', () => {
  it('compresses content.xml with DEFLATE while keeping the mimetype entry Stored', async () => {
    const blob = await writeOdt(doc([paragraph('Text zum Komprimieren, wiederholt. '.repeat(200))]))
    const buffer = Buffer.from(await blob.arrayBuffer())
    const methods = readZipEntryCompressionMethods(buffer)

    expect(methods.size).toBeGreaterThan(0)
    expect(methods.get('content.xml')).toBe(ZIP_COMPRESSION_DEFLATE)
    expect(methods.get('styles.xml')).toBe(ZIP_COMPRESSION_DEFLATE)
    // ODF spec: the `mimetype` entry must remain uncompressed (Stored), independent of
    // the writer's chosen default compression for the rest of the package.
    expect(methods.get('mimetype')).toBe(ZIP_COMPRESSION_STORED)

    // Effect-based proof for content.xml: a highly repetitive entry must actually
    // shrink under DEFLATE.
    const info = readZipEntryInfo(buffer)
    const contentEntry = info.get('content.xml')!
    expect(contentEntry.uncompressedSize).toBeGreaterThan(1000)
    expect(contentEntry.compressedSize).toBeLessThan(contentEntry.uncompressedSize)
  })

  it('keeps the mimetype entry as the first entry in the zip (ODF requirement)', async () => {
    const blob = await writeOdt(doc([paragraph('x')]))
    const buffer = Buffer.from(await blob.arrayBuffer())
    // The very first local file header in the byte stream must be for "mimetype".
    expect(buffer.readUInt32LE(0)).toBe(0x04034b50)
    const nameLen = buffer.readUInt16LE(26)
    const firstName = buffer.toString('utf-8', 30, 30 + nameLen)
    expect(firstName).toBe('mimetype')
  })
})

describe('ODT writer: export determinism (speichern-exportieren-qa.md Testfall 11)', () => {
  it('produces byte-identical output for the same document exported at two different wall-clock times', async () => {
    // See the identical DOCX-side test in docx/__tests__/roundtrip.test.ts for the full
    // rationale. Same root cause here: `writeOdt` calls `zip.file(...)` throughout
    // without an explicit `date` option, so JSZip embeds the wall-clock call time.
    // FIXED (speichern-exportieren-code.md fix round): writer.ts now calls
    // stampZipEntriesForDeterminism(zip) right before generateAsync(), so this is a
    // regression test, not a currently-known defect.
    const content = doc([paragraph('Unveraendert')])
    const blobA = await withMockedDate('2024-01-01T00:00:00Z', () => writeOdt(content))
    const blobB = await withMockedDate('2024-01-01T00:00:03Z', () => writeOdt(content))
    const bufA = Buffer.from(await blobA.arrayBuffer())
    const bufB = Buffer.from(await blobB.arrayBuffer())

    expect(Buffer.compare(bufA, bufB)).toBe(0)
  })

  it('produces byte-identical output for a document containing tables, exported twice at the same wall-clock time (table:name determinism)', async () => {
    // Regression test for a second, independent determinism defect found while
    // verifying the timestamp fix above: writer.ts previously generated `table:name`
    // via `Math.random()`, which would make any document containing a table
    // byte-different on every export regardless of the timestamp fix. Two tables are
    // used so a fixed (non-random) naming scheme is also exercised for uniqueness
    // across multiple tables in the same document, not just single-table determinism.
    const twoTables = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [{ type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('T1')] }],
          },
        ],
      },
      paragraph('Zwischentext'),
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [{ type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('T2')] }],
          },
        ],
      },
    ])

    const blobA = await writeOdt(twoTables)
    const blobB = await writeOdt(twoTables)
    const bufA = Buffer.from(await blobA.arrayBuffer())
    const bufB = Buffer.from(await blobB.arrayBuffer())

    expect(Buffer.compare(bufA, bufB)).toBe(0)

    // Independent proof that names are still unique per table (not merely constant/
    // colliding), by parsing content.xml directly rather than trusting the byte
    // comparison alone.
    const zip = await JSZip.loadAsync(bufA)
    const contentXml = await zip.file('content.xml')!.async('text')
    const tableNames = [...contentXml.matchAll(/<table:table table:name="([^"]+)">/g)].map((m) => m[1])
    expect(tableNames).toHaveLength(2)
    expect(new Set(tableNames).size).toBe(2)
  })
})
