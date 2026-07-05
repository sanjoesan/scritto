import { EditorState } from 'prosemirror-state'
import { TextSelection } from 'prosemirror-state'
import type { Command } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { wordSchema } from '../schema'
import type { WordDocumentContent } from '../documentModel'
import { addRowAfter, addColumnAfter, deleteRowOrTable, deleteColumnOrTable } from '../editor/commands'
import { writeDocx } from '../../docx/writer'
import { readDocx } from '../../docx/reader'
import { writeOdt } from '../../odt/writer'
import { readOdt } from '../../odt/reader'

// Feature round trip (specs/tabelle-struktur-bearbeiten-req.md §4.2): a structure
// operation applied in the editor must survive DOCX *and* ODT export → reimport with the
// resulting structure intact. We apply the real command to an EditorState, then round-trip
// the post-operation document through both writers/readers. Cross-format (§4.3) is exercised
// on this adapter level because the app has no format picker on export.

function para(text?: string): PMNode {
  return wordSchema.node('paragraph', null, text ? [wordSchema.text(text)] : [])
}
function cell(text?: string, attrs?: Record<string, unknown>): PMNode {
  return wordSchema.node('table_cell', attrs ?? null, [para(text)])
}
function trow(...cells: PMNode[]): PMNode {
  return wordSchema.node('table_row', null, cells)
}
function table(...rows: PMNode[]): PMNode {
  return wordSchema.node('table', null, rows)
}
function stateWithTable(t: PMNode, ...trailing: PMNode[]): EditorState {
  const state = EditorState.create({ doc: wordSchema.node('doc', null, [t, ...trailing]), schema: wordSchema })
  // cursor in the first cell (table is the first block → its first cell paragraph is at pos 3)
  return state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(3))))
}

/** Applies a command and returns the resulting document as content ready for the writers. */
function applyToContent(state: EditorState, command: Command): WordDocumentContent {
  let next = state
  command(state, (tr) => {
    next = state.apply(tr)
  })
  return { body: next.doc.toJSON(), header: null, footer: null, meta: { title: '' } }
}

async function roundTripBoth(content: WordDocumentContent) {
  const viaDocx = await readDocx(await writeDocx(content))
  const viaOdt = await readOdt(await writeOdt(content))
  return { viaDocx, viaOdt }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function firstTable(content: WordDocumentContent): any {
  return (content.body as any).content.find((n: any) => n.type === 'table')
}
function rowCount(content: WordDocumentContent): number {
  const t = firstTable(content)
  return t ? t.content.length : 0
}
function cellsInRow(content: WordDocumentContent, row: number): number {
  return firstTable(content).content[row].content.length
}

describe('table structure round trip (DOCX + ODT): insert', () => {
  it('a row inserted below survives both formats (3 rows)', async () => {
    const content = applyToContent(
      stateWithTable(table(trow(cell('A1'), cell('B1')), trow(cell('A2'), cell('B2')))),
      addRowAfter,
    )
    const { viaDocx, viaOdt } = await roundTripBoth(content)
    expect(rowCount(viaDocx)).toBe(3)
    expect(rowCount(viaOdt)).toBe(3)
  })

  it('a column inserted right survives both formats (3 columns per row)', async () => {
    const content = applyToContent(
      stateWithTable(table(trow(cell('A1'), cell('B1')), trow(cell('A2'), cell('B2')))),
      addColumnAfter,
    )
    const { viaDocx, viaOdt } = await roundTripBoth(content)
    expect(cellsInRow(viaDocx, 0)).toBe(3)
    expect(cellsInRow(viaOdt, 0)).toBe(3)
  })
})

describe('table structure round trip (DOCX + ODT): delete', () => {
  it('a deleted row survives both formats (1 row), the other row preserved', async () => {
    // Cursor is in the first cell (row 0 = 'oben'), so that row is the one deleted; row 1
    // ('unten') must remain — and the deleted row's text must be gone.
    const content = applyToContent(
      stateWithTable(table(trow(cell('oben')), trow(cell('unten')))),
      deleteRowOrTable(),
    )
    const { viaDocx, viaOdt } = await roundTripBoth(content)
    expect(rowCount(viaDocx)).toBe(1)
    expect(rowCount(viaOdt)).toBe(1)
    expect(JSON.stringify(viaDocx.body)).toContain('unten')
    expect(JSON.stringify(viaDocx.body)).not.toContain('oben')
    expect(JSON.stringify(viaOdt.body)).toContain('unten')
    expect(JSON.stringify(viaOdt.body)).not.toContain('oben')
  })

  it('a deleted column survives both formats (1 column per row)', async () => {
    const content = applyToContent(
      stateWithTable(table(trow(cell('A1'), cell('B1')), trow(cell('A2'), cell('B2')))),
      deleteColumnOrTable(),
    )
    const { viaDocx, viaOdt } = await roundTripBoth(content)
    expect(cellsInRow(viaDocx, 0)).toBe(1)
    expect(cellsInRow(viaOdt, 0)).toBe(1)
  })

  it('deleting the only row removes the table entirely, surrounding text stays', async () => {
    const content = applyToContent(stateWithTable(table(trow(cell('x'))), para('danach')), deleteRowOrTable())
    const { viaDocx, viaOdt } = await roundTripBoth(content)
    expect(firstTable(viaDocx)).toBeUndefined()
    expect(firstTable(viaOdt)).toBeUndefined()
    expect(viaDocx.body).toBeTruthy()
    expect(JSON.stringify(viaDocx.body)).toContain('danach')
    expect(JSON.stringify(viaOdt.body)).toContain('danach')
  })
})

describe('table structure round trip (DOCX + ODT): merged cells stay intact', () => {
  it('inserting a column past a colspan cell keeps a consistent, non-torn structure', async () => {
    // Row 0 has one cell spanning both columns; row 1 has two normal cells.
    const content = applyToContent(
      stateWithTable(table(trow(cell('span', { colspan: 2 })), trow(cell('a'), cell('b')))),
      addColumnAfter,
    )
    const { viaDocx, viaOdt } = await roundTripBoth(content)
    // Row 1 grows to three real cells; the merged row stays a single (now wider) cell —
    // the sum of colspans per row must be equal across rows (no torn/ragged grid).
    for (const c of [viaDocx, viaOdt]) {
      const t = firstTable(c)
      const widthOfRow = (r: number) =>
        t.content[r].content.reduce((sum: number, cc: any) => sum + (cc.attrs?.colspan ?? 1), 0)
      expect(widthOfRow(0)).toBe(widthOfRow(1))
      expect(widthOfRow(1)).toBe(3)
    }
  })
})
