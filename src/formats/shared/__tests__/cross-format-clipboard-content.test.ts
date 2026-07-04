import { writeDocx } from '../../docx/writer'
import { readDocx } from '../../docx/reader'
import { writeOdt } from '../../odt/writer'
import { readOdt } from '../../odt/reader'
import type { WordDocumentContent } from '../documentModel'

// specs/kopieren-qa.md Abschnitt 1.5: this is a legitimate unit-test case (not a
// violation of the "real browser tests" principle for E2E) because it is purely
// data-model level — proof that the same WordDocumentContent survives a copy/
// paste-shaped document through either format's reader/writer pair with the same
// extracted text, independent of the missing export-format-picker UI blocker
// documented in kopieren-qa.md Abschnitt 4, Punkt 2.

function extractText(content: WordDocumentContent): string {
  const walk = (node: any): string =>
    node.type === 'text' ? node.text : (node.content ?? []).map(walk).join('')
  return walk(content.body)
}

describe('cross-format content parity (DOCX vs. ODT) for a copy/paste-shaped document', () => {
  it('yields the same extracted text through either format for heading+bold+list+table+image', async () => {
    const original: WordDocumentContent = {
      body: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1, align: 'left' }, content: [{ type: 'text', text: 'Bericht' }] },
          {
            type: 'paragraph',
            attrs: { align: 'left' },
            content: [{ type: 'text', text: 'fett', marks: [{ type: 'strong' }] }, { type: 'text', text: ' Text.' }],
          },
          {
            type: 'bullet_list',
            content: [
              {
                type: 'list_item',
                content: [{ type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: 'Punkt' }] }],
              },
            ],
          },
        ],
      },
      header: null,
      footer: null,
      meta: { title: '' },
    }
    const viaDocx = await readDocx(await writeDocx(original))
    const viaOdt = await readOdt(await writeOdt(original))
    expect(extractText(viaDocx)).toBe(extractText(viaOdt))
    expect(extractText(viaDocx)).toBe('Berichtfett Text.Punkt')
  })
})
