import mammoth from 'mammoth'
import { writeDocx } from '../writer'
import type { WordDocumentContent } from '../../shared/documentModel'

/**
 * External validation of writeDocx()'s output using `mammoth`, an independent
 * DOCX -> HTML converter with no code relationship to `src/formats/docx` — the U9
 * test from specs/speichern-exportieren-qa.md §1.3. roundtrip.test.ts only proves
 * `writeDocx` and `readDocx` agree with each other (the exact risk the spec calls
 * "Schreib- und Lesefehler gleichen sich gegenseitig aus"); this test proves a real,
 * unrelated OOXML parser can open the file and recognizes its structure/formatting.
 */

function paragraph(text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) {
  return { type: 'paragraph', attrs: { align: 'left' }, content: text ? [{ type: 'text', text, marks }] : [] }
}

describe('DOCX writer: external validation via mammoth (speichern-exportieren-qa.md U9)', () => {
  it('produces a .docx an independent parser recognizes: heading, bold text, lists, table, running text', async () => {
    const content: WordDocumentContent = {
      body: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1, align: 'left' }, content: [{ type: 'text', text: 'Prüfüng äöüß' }] },
          {
            type: 'paragraph',
            attrs: { align: 'left' },
            content: [
              { type: 'text', text: 'Ein Absatz mit ' },
              { type: 'text', text: 'fettem', marks: [{ type: 'strong' }] },
              { type: 'text', text: ' Text.' },
            ],
          },
          {
            type: 'bullet_list',
            content: [{ type: 'list_item', content: [paragraph('Aufzählungspunkt 1')] }],
          },
          {
            type: 'ordered_list',
            content: [{ type: 'list_item', content: [paragraph('Nummerierter Punkt 1')] }],
          },
          {
            type: 'table',
            content: [
              {
                type: 'table_row',
                content: [
                  { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('Zelle A')] },
                  { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('Zelle B')] },
                ],
              },
            ],
          },
        ],
      },
      header: null,
      footer: null,
      meta: { title: 'Prüfüng äöüß' },
    }

    const blob = await writeDocx(content)
    const buffer = Buffer.from(await blob.arrayBuffer())

    const { value: html, messages } = await mammoth.convertToHtml({ buffer })

    // No unrecognized-structure warnings from an independent parser.
    const errorMessages = messages.filter((m) => m.type === 'error')
    expect(errorMessages, JSON.stringify(errorMessages)).toEqual([])

    expect(html).toContain('Prüfüng äöüß')
    expect(html).toMatch(/<h1[^>]*>Prüfüng äöüß<\/h1>/)
    expect(html).toContain('<strong>fettem</strong>')
    expect(html).toContain('Aufzählungspunkt 1')
    expect(html).toContain('Nummerierter Punkt 1')
    expect(html).toContain('Zelle A')
    expect(html).toContain('Zelle B')
    expect(html).toMatch(/<table>/)
  })
})
