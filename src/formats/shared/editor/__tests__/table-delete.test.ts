import { EditorState, TextSelection, NodeSelection } from 'prosemirror-state'
import { history, undo, redo } from 'prosemirror-history'
import type { Node as PMNode } from 'prosemirror-model'
import { wordSchema } from '../../schema'
import { deleteEnclosingTable, canDeleteTable, deleteTableAtSelection } from '../commands'

// ---- builders -------------------------------------------------------------
function para(text?: string): PMNode {
  return wordSchema.node('paragraph', null, text ? [wordSchema.text(text)] : [])
}
function cell(...content: PMNode[]): PMNode {
  return wordSchema.node('table_cell', null, content.length ? content : [para()])
}
function trow(...cells: PMNode[]): PMNode {
  return wordSchema.node('table_row', null, cells)
}
function table(...rows: PMNode[]): PMNode {
  return wordSchema.node('table', null, rows)
}
function docNode(...blocks: PMNode[]): PMNode {
  return wordSchema.node('doc', null, blocks)
}
function docState(...blocks: PMNode[]): EditorState {
  return EditorState.create({ doc: docNode(...blocks), schema: wordSchema })
}

/** Document position just inside the first text node containing `text` (a valid cursor spot). */
function findTextPos(doc: PMNode, text: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.isText && node.text && node.text.includes(text)) found = pos
    return found < 0
  })
  if (found < 0) throw new Error(`text ${JSON.stringify(text)} not found`)
  return found
}
function withCursorAt(state: EditorState, text: string): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(findTextPos(state.doc, text)))))
}
/** Selects the (first) table node itself as a NodeSelection — the state Backspace after a table
 * produces. Finds the table by scanning the top level. */
function withTableNodeSelected(state: EditorState): EditorState {
  let tablePos = -1
  state.doc.forEach((node, offset) => {
    if (tablePos < 0 && node.type.name === 'table') tablePos = offset
  })
  if (tablePos < 0) throw new Error('no top-level table')
  return state.apply(state.tr.setSelection(NodeSelection.create(state.doc, tablePos)))
}

function apply(state: EditorState, command: ReturnType<typeof deleteEnclosingTable>): { state: EditorState; ran: boolean } {
  let next = state
  const ran = command(state, (tr) => {
    next = state.apply(tr)
  })
  return { state: next, ran }
}
function countTables(doc: PMNode): number {
  let n = 0
  doc.descendants((node) => {
    if (node.type.name === 'table') n++
    return true
  })
  return n
}
function topLevelTypes(doc: PMNode): string[] {
  const types: string[] = []
  doc.forEach((node) => types.push(node.type.name))
  return types
}

// ---------------------------------------------------------------------------

describe('deleteEnclosingTable (cursor inside a table)', () => {
  it('removes the whole table, surrounding paragraphs stay intact', () => {
    const start = withCursorAt(docState(para('before'), table(trow(cell(para('x')), cell(para('y')))), para('after')), 'x')
    const { state, ran } = apply(start, deleteEnclosingTable())
    expect(ran).toBe(true)
    expect(countTables(state.doc)).toBe(0)
    expect(topLevelTypes(state.doc)).toEqual(['paragraph', 'paragraph'])
    expect(state.doc.textContent).toBe('beforeafter')
    // schema stays valid
    expect(() => state.doc.check()).not.toThrow()
  })

  it('replaces a lone table with an empty paragraph (content: block+ stays satisfied)', () => {
    const start = withCursorAt(docState(table(trow(cell(para('only'))))), 'only')
    const { state, ran } = apply(start, deleteEnclosingTable())
    expect(ran).toBe(true)
    expect(countTables(state.doc)).toBe(0)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild!.type.name).toBe('paragraph')
    expect(() => state.doc.check()).not.toThrow()
  })

  it('returns false when the cursor is not inside a table', () => {
    const start = withCursorAt(docState(para('plain')), 'plain')
    expect(deleteEnclosingTable()(start, undefined)).toBe(false)
  })
})

describe('canDeleteTable', () => {
  it('is true for a cursor inside a table', () => {
    const start = withCursorAt(docState(para('before'), table(trow(cell(para('x'))))), 'x')
    expect(canDeleteTable(start)).toBe(true)
  })

  it('is true for a NodeSelection on the table itself (Backspace-after-table state)', () => {
    const start = withTableNodeSelected(docState(para('before'), table(trow(cell(para('x')))), para('after')))
    expect(start.selection instanceof NodeSelection).toBe(true)
    expect(canDeleteTable(start)).toBe(true)
  })

  it('is false outside any table', () => {
    const start = withCursorAt(docState(para('plain')), 'plain')
    expect(canDeleteTable(start)).toBe(false)
  })
})

describe('deleteTableAtSelection (NodeSelection-on-table path — the §2.9 mandatory case)', () => {
  it('removes the table from a NodeSelection without a RangeError and without returning false', () => {
    const start = withTableNodeSelected(docState(para('before'), table(trow(cell(para('x')), cell(para('y')))), para('after')))
    let result: { state: EditorState; ran: boolean } | null = null
    expect(() => {
      result = apply(start, deleteTableAtSelection())
    }).not.toThrow() // selectedRect/selectionCell would RangeError here — must be bypassed
    expect(result!.ran).toBe(true)
    expect(countTables(result!.state.doc)).toBe(0)
    expect(result!.state.doc.textContent).toBe('beforeafter')
    expect(() => result!.state.doc.check()).not.toThrow()
  })

  it('delegates to the enclosing-table path for a cursor inside a table', () => {
    const start = withCursorAt(docState(para('before'), table(trow(cell(para('x')))), para('after')), 'x')
    const { state, ran } = apply(start, deleteTableAtSelection())
    expect(ran).toBe(true)
    expect(countTables(state.doc)).toBe(0)
    expect(state.doc.textContent).toBe('beforeafter')
  })

  it('returns false (button stays inert) when no table is involved', () => {
    const start = withCursorAt(docState(para('plain')), 'plain')
    expect(deleteTableAtSelection()(start, undefined)).toBe(false)
  })

  it('leaves a lone selected table replaced by exactly one empty paragraph', () => {
    const start = withTableNodeSelected(docState(table(trow(cell(para('only'))))))
    const { state } = apply(start, deleteTableAtSelection())
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild!.type.name).toBe('paragraph')
    expect(state.doc.firstChild!.childCount).toBe(0)
  })
})

describe('nested tables', () => {
  // outer table, its single cell holds [para('outer'), innerTable]
  const build = () =>
    docState(
      para('before'),
      table(trow(cell(para('outer'), table(trow(cell(para('inner'))))))),
      para('after'),
    )

  it('cursor in the inner table removes ONLY the inner table; outer stays', () => {
    const start = withCursorAt(build(), 'inner')
    const { state, ran } = apply(start, deleteTableAtSelection())
    expect(ran).toBe(true)
    expect(countTables(state.doc)).toBe(1) // outer remains
    expect(state.doc.textContent).toContain('outer')
    expect(state.doc.textContent).not.toContain('inner')
    expect(() => state.doc.check()).not.toThrow()
  })

  it('cursor in the outer cell (not the inner table) removes the outer table incl. the inner one', () => {
    const start = withCursorAt(build(), 'outer')
    const { state, ran } = apply(start, deleteTableAtSelection())
    expect(ran).toBe(true)
    expect(countTables(state.doc)).toBe(0)
    expect(state.doc.textContent).toBe('beforeafter')
    expect(() => state.doc.check()).not.toThrow()
  })
})

describe('delete is a single undo step', () => {
  function historyState(...blocks: PMNode[]): EditorState {
    return EditorState.create({ doc: docNode(...blocks), schema: wordSchema, plugins: [history()] })
  }
  it('one Undo restores the whole table; one Redo removes it again', () => {
    let state = withCursorAt(historyState(para('before'), table(trow(cell(para('x')), cell(para('y')))), para('after')), 'x')
    deleteTableAtSelection()(state, (tr) => {
      state = state.apply(tr)
    })
    expect(countTables(state.doc)).toBe(0)
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(countTables(state.doc)).toBe(1) // fully restored in ONE undo
    expect(state.doc.textContent).toBe('beforexyafter')
    redo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(countTables(state.doc)).toBe(0)
  })
})
