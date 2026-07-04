import type { Command, EditorState } from 'prosemirror-state'
import { wrapInList, liftListItem } from 'prosemirror-schema-list'
import { isInTable } from 'prosemirror-tables'
import { wordSchema } from '../schema'

export { isInTable }

export type Align = 'left' | 'center' | 'right' | 'justify'

const alignableTypes = new Set(['paragraph', 'heading'])

/** Sets text-align on the block(s) covered by the selection, if they support it. */
export function setAlign(align: Align): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection
    let applicable = false
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (alignableTypes.has(node.type.name)) {
        applicable = true
        if (dispatch) {
          dispatch(state.tr.setNodeAttribute(pos, 'align', align))
        }
      }
    })
    return applicable
  }
}

export function isAlignActive(state: EditorState, align: Align): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth)
    if (alignableTypes.has(node.type.name)) {
      return node.attrs.align === align
    }
  }
  return false
}

export function setHeading(level: number | null): Command {
  return (state, dispatch) => {
    const type = level === null ? wordSchema.nodes.paragraph : wordSchema.nodes.heading
    const attrs = level === null ? undefined : { level, align: 'left' }
    const { $from, $to } = state.selection
    if (!$from.sameParent($to)) return false
    const parent = $from.parent
    if (!alignableTypes.has(parent.type.name)) return false
    if (dispatch) {
      const pos = $from.before($from.depth)
      const tr = state.tr.setBlockType(pos, pos + parent.nodeSize, type, attrs)
      dispatch(tr)
    }
    return true
  }
}

export function toggleList(ordered: boolean): Command {
  const listType = ordered ? wordSchema.nodes.ordered_list : wordSchema.nodes.bullet_list
  return wrapInList(listType)
}

export function liftFromList(): Command {
  return liftListItem(wordSchema.nodes.list_item)
}

export function insertImage(src: string, alt = ''): Command {
  return (state, dispatch) => {
    const node = wordSchema.nodes.image.create({ src, alt })
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(node))
    }
    return true
  }
}

export function insertTable(rows: number, cols: number): Command {
  return (state, dispatch) => {
    if (dispatch) {
      const cell = () => wordSchema.nodes.table_cell.createAndFill()!
      const row = () => wordSchema.nodes.table_row.create(null, Array.from({ length: cols }, cell))
      const table = wordSchema.nodes.table.create(null, Array.from({ length: rows }, row))
      dispatch(state.tr.replaceSelectionWith(table))
    }
    return true
  }
}

export type ColorMarkName = 'textColor' | 'highlight'

export function applyMarkColor(markName: ColorMarkName, color: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty) return false
    if (dispatch) dispatch(state.tr.addMark(from, to, wordSchema.marks[markName].create({ color })))
    return true
  }
}

export function clearMarkColor(markName: ColorMarkName): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (empty) return false
    if (dispatch) dispatch(state.tr.removeMark(from, to, wordSchema.marks[markName]))
    return true
  }
}

