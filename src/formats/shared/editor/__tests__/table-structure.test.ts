import { EditorState, TextSelection } from 'prosemirror-state'
import { TableMap, CellSelection } from 'prosemirror-tables'
import type { Node as PMNode } from 'prosemirror-model'
import { wordSchema } from '../../schema'
import {
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRowOrTable,
  deleteColumnOrTable,
} from '../commands'

// ---- builders -------------------------------------------------------------
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
function docState(...blocks: PMNode[]): EditorState {
  return EditorState.create({ doc: wordSchema.node('doc', null, blocks), schema: wordSchema })
}

/** The table is assumed to be the doc's first block; puts the cursor in its first cell. */
function withCursorInFirstCell(state: EditorState): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(3))))
}
function firstTable(doc: PMNode): PMNode | null {
  const first = doc.firstChild
  return first && first.type.name === 'table' ? first : null
}
function mapOf(doc: PMNode): TableMap | null {
  const t = firstTable(doc)
  return t ? TableMap.get(t) : null
}
/** Applies a Command to a state and returns the resulting state (or the same state if the
 * command reported "not applicable"). */
function apply(state: EditorState, command: ReturnType<typeof addRowBefore> | typeof addRowBefore): EditorState {
  let next = state
  const ran = (command as (s: EditorState, d: (tr: EditorState['tr']) => void) => boolean)(state, (tr) => {
    next = state.apply(tr)
  })
  return ran ? next : state
}

describe('table structure: insert row/column', () => {
  it('addRowBefore / addRowAfter add exactly one row', () => {
    const start = withCursorInFirstCell(docState(table(trow(cell('a'), cell('b')), trow(cell('c'), cell('d')))))
    expect(mapOf(start.doc)!.height).toBe(2)
    expect(mapOf(apply(start, addRowBefore).doc)!.height).toBe(3)
    expect(mapOf(apply(start, addRowAfter).doc)!.height).toBe(3)
  })

  it('addColumnBefore / addColumnAfter add exactly one column', () => {
    const start = withCursorInFirstCell(docState(table(trow(cell('a'), cell('b')), trow(cell('c'), cell('d')))))
    expect(mapOf(start.doc)!.width).toBe(2)
    expect(mapOf(apply(start, addColumnBefore).doc)!.width).toBe(3)
    expect(mapOf(apply(start, addColumnAfter).doc)!.width).toBe(3)
  })
})

describe('table structure: delete row/column (with "last one removes table" guard)', () => {
  it('deletes a single row from a multi-row table, table stays', () => {
    const start = withCursorInFirstCell(docState(table(trow(cell('a')), trow(cell('b')))))
    const after = apply(start, deleteRowOrTable())
    expect(mapOf(after.doc)!.height).toBe(1)
  })

  it('deletes a single column from a multi-column table, table stays', () => {
    const start = withCursorInFirstCell(docState(table(trow(cell('a'), cell('b')))))
    const after = apply(start, deleteColumnOrTable())
    expect(mapOf(after.doc)!.width).toBe(1)
  })

  it('removes the whole table when the last row is deleted (not a silent no-op)', () => {
    const start = withCursorInFirstCell(docState(table(trow(cell('only'))), para('after')))
    const after = apply(start, deleteRowOrTable())
    expect(firstTable(after.doc)).toBeNull()
    expect(after.doc.textContent).toBe('after')
  })

  it('removes the whole table when the last column is deleted', () => {
    const start = withCursorInFirstCell(docState(table(trow(cell('x'))), para('keep')))
    const after = apply(start, deleteColumnOrTable())
    expect(firstTable(after.doc)).toBeNull()
    expect(after.doc.textContent).toBe('keep')
  })

  it('keeps the document non-empty (inserts a paragraph) when the only table is removed', () => {
    const start = withCursorInFirstCell(docState(table(trow(cell('solo')))))
    const after = apply(start, deleteRowOrTable())
    expect(firstTable(after.doc)).toBeNull()
    expect(after.doc.childCount).toBeGreaterThanOrEqual(1)
    expect(after.doc.firstChild!.type.name).toBe('paragraph')
  })

  it('treats a CellSelection spanning ALL columns as "remove whole table" (the library no-op trap)', () => {
    const start = docState(table(trow(cell('a'), cell('b')), trow(cell('c'), cell('d'))))
    const map = mapOf(start.doc)!
    const tableStart = 1 // table is the first block: its content starts at pos 1
    const anchor = tableStart + map.map[0] // cell (0,0)
    const head = tableStart + map.map[1] // cell (0,1) — same row, all columns selected
    const sel = CellSelection.create(start.doc, anchor, head)
    const selState = start.apply(start.tr.setSelection(sel))
    const after = apply(selState, deleteColumnOrTable())
    expect(firstTable(after.doc)).toBeNull()
  })

  it('returns false when the cursor is not inside a table', () => {
    const state = docState(para('plain text'))
    const withCursor = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(1))))
    expect(deleteRowOrTable()(withCursor, undefined)).toBe(false)
    expect(deleteColumnOrTable()(withCursor, undefined)).toBe(false)
  })
})

describe('table structure: merged cells', () => {
  it('inserting a column through a horizontally merged (colspan) cell widens the grid by one', () => {
    // Row 0: one cell spanning both columns; row 1: two normal cells.
    const start = withCursorInFirstCell(
      docState(table(trow(cell('span', { colspan: 2 })), trow(cell('a'), cell('b')))),
    )
    expect(mapOf(start.doc)!.width).toBe(2)
    const after = apply(start, addColumnAfter)
    // effective grid width grows by exactly one, merge stays intact (no torn structure)
    expect(mapOf(after.doc)!.width).toBe(3)
    expect(firstTable(after.doc)).not.toBeNull()
  })

  // A 3×3 grid whose top-left cell is a 2×2 merge block (colspan 2 AND rowspan 2) — the
  // hardest edge case (req §2.7 / §3 Nr. 11). "Not torn" means the result is still a
  // schema-valid table whose TableMap.get() succeeds (it throws on a ragged/overlapping
  // grid) with the expected effective dimensions.
  function combinedMergeState(): EditorState {
    return withCursorInFirstCell(
      docState(
        table(
          trow(cell('M', { colspan: 2, rowspan: 2 }), cell('r0c2')),
          trow(cell('r1c2')),
          trow(cell('r2c0'), cell('r2c1'), cell('r2c2')),
        ),
      ),
    )
  }
  function assertValidTable(doc: PMNode): TableMap {
    const t = firstTable(doc)!
    expect(t).not.toBeNull()
    t.check() // throws if the table node is schema-invalid
    return TableMap.get(t) // throws if the grid is ragged/overlapping
  }

  it('sanity: the combined 2×2 merge block starts as a consistent 3×3 grid', () => {
    const map = assertValidTable(combinedMergeState().doc)
    expect(map.width).toBe(3)
    expect(map.height).toBe(3)
  })

  it('inserting a column through a combined colspan+rowspan block keeps the grid consistent', () => {
    const after = apply(combinedMergeState(), addColumnAfter)
    const map = assertValidTable(after.doc)
    expect(map.width).toBe(4)
    expect(map.height).toBe(3)
  })

  it('inserting a row through a combined colspan+rowspan block keeps the grid consistent', () => {
    const after = apply(combinedMergeState(), addRowAfter)
    const map = assertValidTable(after.doc)
    expect(map.width).toBe(3)
    expect(map.height).toBe(4)
  })

  it('deleting a row that intersects a combined merge block leaves a consistent grid (no orphan cell)', () => {
    const after = apply(combinedMergeState(), deleteRowOrTable())
    // table survives (3 rows, deleting the merged rows still leaves row 2) and stays valid
    const map = assertValidTable(after.doc)
    expect(map.width).toBe(3)
    expect(map.height).toBeGreaterThanOrEqual(1)
  })

  it('deleting the anchor row of a rowspan (via a regular cell in that row) migrates its content', () => {
    // 3 rows; 'Tall' spans rows 0–1, anchored in row 0. Deleting row 0 via its *regular*
    // cell must keep 'Tall' in the table (content migrates down, rowspan decrements) —
    // req §2.7. (Putting the cursor in the rowspan cell itself selects all its rows and is
    // the "covers all rows" case handled separately.)
    const start = docState(
      table(
        trow(cell('Tall', { rowspan: 2 }), cell('r0c1')),
        trow(cell('r1c1')),
        trow(cell('r2c0'), cell('r2c1')),
      ),
    )
    const pos = 1 + mapOf(start.doc)!.map[1] // grid cell (0,1) = the regular cell 'r0c1'
    const st = start.apply(start.tr.setSelection(TextSelection.near(start.doc.resolve(pos + 1))))
    const after = apply(st, deleteRowOrTable())
    assertValidTable(after.doc)
    expect(JSON.stringify(after.doc.toJSON())).toContain('Tall')
  })
})

describe('table structure: multi-cell selection inserts exactly one element', () => {
  function cellPos(state: EditorState, idx: number): number {
    // absolute position of the cell with grid index `idx` (table is the first block)
    return 1 + mapOf(state.doc)!.map[idx]
  }
  it('a CellSelection spanning two of three rows still inserts only one row', () => {
    const start = docState(table(trow(cell('r0')), trow(cell('r1')), trow(cell('r2'))))
    const map = mapOf(start.doc)!
    expect(map.height).toBe(3)
    const sel = CellSelection.create(start.doc, cellPos(start, 0), cellPos(start, 1)) // rows 0–1
    const selState = start.apply(start.tr.setSelection(sel))
    const after = apply(selState, addRowAfter)
    expect(mapOf(after.doc)!.height).toBe(4) // exactly one added, not two
  })
  it('a CellSelection spanning two of three columns still inserts only one column', () => {
    const start = docState(table(trow(cell('c0'), cell('c1'), cell('c2'))))
    const map = mapOf(start.doc)!
    expect(map.width).toBe(3)
    const sel = CellSelection.create(start.doc, cellPos(start, 0), cellPos(start, 1)) // cols 0–1
    const selState = start.apply(start.tr.setSelection(sel))
    const after = apply(selState, addColumnAfter)
    expect(mapOf(after.doc)!.width).toBe(4) // exactly one added, not two
  })
})
