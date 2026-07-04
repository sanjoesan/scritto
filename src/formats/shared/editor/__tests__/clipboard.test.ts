import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { wordSchema } from '../../schema'
import { clipboardTextSerializer } from '../clipboard'

// clipboardTextSerializer never reads its `view` argument (see clipboard.ts) —
// a stub is enough to satisfy the type without constructing a real EditorView.
const fakeView = {} as EditorView

function serialize(...topLevelNodes: PMNode[]): string {
  const slice = new Slice(Fragment.from(topLevelNodes), 0, 0)
  return clipboardTextSerializer(slice, fakeView)
}

function paragraph(text: string) {
  return wordSchema.nodes.paragraph.create(null, text ? wordSchema.text(text) : null)
}

function listItem(...children: PMNode[]) {
  return wordSchema.nodes.list_item.create(null, children)
}

describe('clipboardTextSerializer', () => {
  it('serializes a 2x2 table as tab-separated cells and newline-separated rows', () => {
    const cell = (text: string) => wordSchema.nodes.table_cell.create(null, paragraph(text))
    const row = (a: string, b: string) => wordSchema.nodes.table_row.create(null, [cell(a), cell(b)])
    const table = wordSchema.nodes.table.create(null, [row('A1', 'B1'), row('A2', 'B2')])

    expect(serialize(table)).toBe('A1\tB1\nA2\tB2')
  })

  it('keeps full cell content for a table with colspan/rowspan', () => {
    const spanningCell = wordSchema.nodes.table_cell.create({ colspan: 2 }, paragraph('Verbunden'))
    const normalCell = wordSchema.nodes.table_cell.create(null, paragraph('Normal'))
    const row1 = wordSchema.nodes.table_row.create(null, [spanningCell])
    const row2 = wordSchema.nodes.table_row.create(null, [normalCell, wordSchema.nodes.table_cell.create(null, paragraph('Zwei'))])
    const table = wordSchema.nodes.table.create(null, [row1, row2])

    // Exact (not just `toContain`): a spanning cell is emitted as a single cell,
    // i.e. `colspan` does NOT pad the row with empty columns to line the grid up.
    // That's a deliberate limitation — a tab/newline plain-text raster cannot
    // express spans — and pinning the exact output guards against regressions
    // that would silently start (or stop) padding.
    expect(serialize(table)).toBe('Verbunden\nNormal\tZwei')
  })

  it('serializes a bare run of table_row nodes (CellSelection.content shape) tab/newline-separated', () => {
    // prosemirror-tables' `CellSelection.content()` returns a Slice whose
    // top-level fragment is a bare run of `table_row` nodes NOT wrapped in a
    // `table` — the most subtle branch of clipboard.ts (rowRun/flushRowRun),
    // otherwise only exercised by the WebKit-skipped E2E T-14a. See
    // specs/kopieren-code.md Finding 5.1.
    const cell = (t: string) => wordSchema.nodes.table_cell.create(null, paragraph(t))
    const row = (a: string, b: string) => wordSchema.nodes.table_row.create(null, [cell(a), cell(b)])

    expect(serialize(row('A1', 'B1'), row('A2', 'B2'))).toBe('A1\tB1\nA2\tB2')
  })

  it('flushes a row-run correctly when interleaved with a normal block', () => {
    const cell = (t: string) => wordSchema.nodes.table_cell.create(null, paragraph(t))
    const row = (a: string, b: string) => wordSchema.nodes.table_row.create(null, [cell(a), cell(b)])

    expect(serialize(row('A1', 'B1'), paragraph('X'), row('A2', 'B2'))).toBe('A1\tB1\n\nX\n\nA2\tB2')
  })

  it('flattens a hard_break inside a table cell to a space so the tab/row grid stays intact', () => {
    // A cell containing a line break must not inject a raw "\n" into the raster —
    // that would break the tab-per-column / newline-per-row structure. rowToPlainText
    // deliberately collapses in-cell newlines to a single space. See kopieren-code.md 5.3.
    const cellWithBreak = wordSchema.nodes.table_cell.create(
      null,
      wordSchema.nodes.paragraph.create(null, [
        wordSchema.text('a'),
        wordSchema.nodes.hard_break.create(),
        wordSchema.text('b'),
      ]),
    )
    const row = wordSchema.nodes.table_row.create(null, [cellWithBreak, wordSchema.nodes.table_cell.create(null, paragraph('c'))])
    const table = wordSchema.nodes.table.create(null, [row])

    expect(serialize(table)).toBe('a b\tc')
  })

  it('extracts recoverable text from an unsupported_block via the generic branch', () => {
    // unsupported_block (schema.ts) has no dedicated serializer branch and must
    // fall through the generic `textBetween` path, keeping its salvaged text
    // rather than dropping to an empty string. See kopieren-code.md 5.3.
    const block = wordSchema.nodes.unsupported_block.create({ kind: 'object' }, paragraph('Rest'))

    expect(serialize(block)).toBe('Rest')
  })

  it('serializes a bullet list with "- " markers, one item per line', () => {
    const list = wordSchema.nodes.bullet_list.create(null, [
      listItem(paragraph('Eins')),
      listItem(paragraph('Zwei')),
      listItem(paragraph('Drei')),
    ])

    expect(serialize(list)).toBe('- Eins\n- Zwei\n- Drei')
  })

  it('starts numbering at a non-1 "start" attribute for ordered lists', () => {
    const list = wordSchema.nodes.ordered_list.create({ start: 5 }, [listItem(paragraph('Erstens')), listItem(paragraph('Zweitens'))])

    expect(serialize(list)).toBe('5. Erstens\n6. Zweitens')
  })

  it('keeps a nested list indented and structurally distinguishable from its parent', () => {
    const nested = wordSchema.nodes.bullet_list.create(null, [listItem(paragraph('Unterpunkt'))])
    const outer = wordSchema.nodes.bullet_list.create(null, [
      listItem(paragraph('Eins'), nested),
      listItem(paragraph('Zwei')),
    ])

    const text = serialize(outer)
    expect(text).toContain('- Eins')
    expect(text).toContain('- Zwei')
    // The nested item's marker must be indented — i.e. not simply "- Unterpunkt"
    // flush against the margin like a top-level item.
    expect(text).toMatch(/\n\s+- Unterpunkt/)
    expect(text).not.toContain('\n- Unterpunkt')
  })

  it('renders a hard_break as a newline instead of merging the surrounding words', () => {
    const para = wordSchema.nodes.paragraph.create(null, [
      wordSchema.text('Zeile1'),
      wordSchema.nodes.hard_break.create(),
      wordSchema.text('Zeile2'),
    ])

    expect(serialize(para)).toBe('Zeile1\nZeile2')
  })

  it('separates multiple top-level blocks with a blank line', () => {
    const heading = wordSchema.nodes.heading.create({ level: 1 }, wordSchema.text('Titel'))
    const body = paragraph('Text.')
    const list = wordSchema.nodes.bullet_list.create(null, [listItem(paragraph('Eins')), listItem(paragraph('Zwei'))])

    expect(serialize(heading, body, list)).toBe('Titel\n\nText.\n\n- Eins\n- Zwei')
  })

  it('returns an empty string for an empty slice without throwing', () => {
    expect(serialize()).toBe('')
  })

  it('regression: hard_break.spec.leafText is defined and returns a newline', () => {
    const leafText = wordSchema.nodes.hard_break.spec.leafText
    expect(leafText).toBeDefined()
    expect(leafText?.(wordSchema.nodes.hard_break.create())).toBe('\n')
  })
})
