import type { Command, EditorState, Transaction } from 'prosemirror-state'
import { TextSelection, NodeSelection } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { wrapInList, liftListItem } from 'prosemirror-schema-list'
import {
  isInTable,
  addRowBefore,
  addRowAfter,
  deleteRow,
  addColumnBefore,
  addColumnAfter,
  deleteColumn,
  selectedRect,
  mergeCells,
  splitCell,
  CellSelection,
} from 'prosemirror-tables'
import { wordSchema } from '../schema'

// Insert commands are used verbatim from prosemirror-tables (they already handle
// colspan/rowspan correctly). Delete needs custom "last row/column removes the whole
// table" handling — see deleteRowOrTable / deleteColumnOrTable below.
export { isInTable, addRowBefore, addRowAfter, addColumnBefore, addColumnAfter }

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

// Image display-size bounds (CSS px). The lower bound only guards against 0/negative/
// collapsed images (not a "nice size" minimum); the upper bound stops an accidental
// 50000px value from bloating the editor/export. Enforced here in the command, not just
// the writer, so 0 never reaches the model. See bild-groesse-aendern-req.md §2.8 / §3.18.
export const IMAGE_MIN_PX = 8
export const IMAGE_MAX_PX = 3000

/** Clamps a raw dimension to [IMAGE_MIN_PX, IMAGE_MAX_PX]; NaN/≤0 → the floor. */
export function clampImageDim(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return IMAGE_MIN_PX
  return Math.max(IMAGE_MIN_PX, Math.min(IMAGE_MAX_PX, Math.round(n)))
}

/** The image node + its position when the current selection is a NodeSelection on an
 * image, else null. Drives the size properties panel and the resize handles. */
export function selectedImage(state: EditorState): { node: PMNode; pos: number } | null {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === 'image') {
    return { node: sel.node, pos: sel.from }
  }
  return null
}

/**
 * Sets the display width/height (px) of the currently selected image, clamped to
 * [IMAGE_MIN_PX, IMAGE_MAX_PX]. The NodeSelection is preserved (setNodeAttribute keeps it),
 * so a second resize or a delete needs no re-click; the view scrolls the image into view
 * (View-Sync, §2.2.4). Returns false when the selection is not an image.
 */
export function setImageSize(width: number, height: number): Command {
  const image = wordSchema.nodes.image
  return (state, dispatch) => {
    const sel = state.selection
    if (!(sel instanceof NodeSelection) || sel.node.type !== image) return false
    const w = clampImageDim(width)
    const h = clampImageDim(height)
    // No-op when the size is unchanged — otherwise a redundant commit (e.g. an input's blur
    // firing right after its Enter) would add an empty, confusing extra undo step.
    if (sel.node.attrs.width === w && sel.node.attrs.height === h) return true
    if (dispatch) {
      const tr = state.tr.setNodeAttribute(sel.from, 'width', w).setNodeAttribute(sel.from, 'height', h)
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/**
 * Sets an image's size by its DOCUMENT POSITION rather than the current selection. The size
 * panel captured this position when it rendered; it stays valid because the only intervening
 * transaction (the async intrinsic-size capture) is a position-neutral attribute step. This
 * is robust against a Tablet-timing race where, at the moment the user presses Enter in a
 * size field, `view.state.selection` momentarily is no longer the image's NodeSelection
 * (field focus / DOM-selection sync) — the selection-based {@link setImageSize} would then
 * silently no-op. Re-establishes the NodeSelection on the image so further edits keep working.
 * See bild-groesse-aendern-req.md §2.2 (2. QA-Nachbesserung).
 */
export function setImageSizeAt(pos: number, width: number, height: number): Command {
  const image = wordSchema.nodes.image
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node || node.type !== image) return false
    const w = clampImageDim(width)
    const h = clampImageDim(height)
    if (node.attrs.width === w && node.attrs.height === h) return true // no-op → no extra undo step
    if (dispatch) {
      const tr = state.tr.setNodeAttribute(pos, 'width', w).setNodeAttribute(pos, 'height', h)
      tr.setSelection(NodeSelection.create(tr.doc, pos)) // re-establish selection on the image
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/**
 * Inserts a `hard_break` at the current selection. Without this there is no
 * in-app way to create a `hard_break` at all (readers/writers already
 * round-trip it correctly, see specs/kopieren-code.md Abschnitt 0.5), which
 * makes the "copy a line break" behaviour untestable except via a file-import
 * detour. See specs/kopieren-code.md Abschnitt 2.4.
 */
export function insertHardBreak(): Command {
  return (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(wordSchema.nodes.hard_break.create()).scrollIntoView())
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

/**
 * Deletes the table node spanning `[tablePos, tablePos + tableNode.nodeSize)` and leaves the
 * cursor at a sensible spot. If the table was the only block, an empty paragraph is inserted
 * so the schema's `content: 'block+'` invariant holds and the editor stays usable. One
 * transaction = one undo step. Shared by every "remove the whole table" path so they behave
 * bit-identically regardless of which selection state triggered them.
 */
function dispatchTableRemoval(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  tablePos: number,
  tableNode: PMNode,
) {
  let tr = state.tr.delete(tablePos, tablePos + tableNode.nodeSize)
  let cursorPos = tablePos
  if (tr.doc.childCount === 0) {
    tr = tr.insert(0, wordSchema.nodes.paragraph.create())
    cursorPos = 1
  }
  const sel = TextSelection.near(tr.doc.resolve(Math.min(cursorPos, tr.doc.content.size)))
  dispatch(tr.setSelection(sel).scrollIntoView())
}

/**
 * Removes the entire table enclosing the current selection (a cursor or a CellSelection
 * inside it). Undo restores the whole table in one step. Exported so the "Tabelle löschen"
 * toolbar button can reach it directly (via {@link deleteTableAtSelection}); it is also the
 * shared path the "last row/column removes the table" behaviour uses (deleteRowOrTable /
 * deleteColumnOrTable). See specs/tabelle-erstellen-loeschen-req.md §2.8.
 */
export function deleteEnclosingTable(): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false
    const rect = selectedRect(state)
    const tablePos = rect.tableStart - 1
    const tableNode = state.doc.nodeAt(tablePos)
    if (!tableNode || tableNode.type.name !== 'table') return false
    if (dispatch) dispatchTableRemoval(state, dispatch, tablePos, tableNode)
    return true
  }
}

/**
 * True when "Tabelle löschen" can act: either the cursor is inside a table (the ordinary case,
 * `isInTable`) OR the whole table is selected as a `NodeSelection` — the state a Backspace at
 * the start of the paragraph right after a table produces via baseKeymap. `isInTable` does NOT
 * recognise that NodeSelection (it climbs the ancestors of `$head` looking for a table row, but
 * the selected table sits at the position and is not an ancestor), so gating the button on
 * `isInTable` alone would wrongly disable it in that everyday state. See
 * specs/tabelle-erstellen-loeschen-req.md §2.9 (the central, non-negotiable acceptance point).
 */
export function canDeleteTable(state: EditorState): boolean {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === 'table') return true
  return isInTable(state)
}

/**
 * Removes the whole table the selection refers to, covering both entry states with one
 * user-visible result:
 *  - a `NodeSelection` on the table itself → delete that node directly from `sel.from`. We must
 *    NOT fall through to {@link deleteEnclosingTable} here: it calls `selectedRect()` →
 *    `selectionCell()`, which throw a `RangeError` for a table NodeSelection (there is no cell
 *    around the position). The node and its position are already known from the selection.
 *  - a cursor / CellSelection inside a table → {@link deleteEnclosingTable} (the shared path the
 *    row/column deletes already use), so an empty selection outside any table returns `false`
 *    and the button stays inert.
 * One transaction = one undo step. See specs/tabelle-erstellen-loeschen-req.md §2.8/§2.9.
 */
export function deleteTableAtSelection(): Command {
  return (state, dispatch, view) => {
    const sel = state.selection
    if (sel instanceof NodeSelection && sel.node.type.name === 'table') {
      if (dispatch) dispatchTableRemoval(state, dispatch, sel.from, sel.node)
      return true
    }
    return deleteEnclosingTable()(state, dispatch, view)
  }
}

/**
 * Deletes the selected row(s). When the selection covers *every* row (a one-row table,
 * or a CellSelection spanning all rows) `deleteRow` from prosemirror-tables refuses
 * silently (no dispatch, and — the trap — its dispatch-less availability probe still
 * returns `true`). In that exact state we remove the whole table instead, matching
 * Word/LibreOffice. The guard mirrors the library's own refuse condition
 * (`rect.top === 0 && rect.bottom === map.height`). See specs/tabelle-struktur-bearbeiten-req.md §2.8.
 */
export function deleteRowOrTable(): Command {
  return (state, dispatch, view) => {
    if (!isInTable(state)) return false
    const rect = selectedRect(state)
    const deletesAllRows = rect.top === 0 && rect.bottom === rect.map.height
    return deletesAllRows ? deleteEnclosingTable()(state, dispatch, view) : deleteRow(state, dispatch)
  }
}

/** Column counterpart to {@link deleteRowOrTable}; removes the whole table when the
 * selection spans every column (`rect.left === 0 && rect.right === map.width`). */
export function deleteColumnOrTable(): Command {
  return (state, dispatch, view) => {
    if (!isInTable(state)) return false
    const rect = selectedRect(state)
    const deletesAllColumns = rect.left === 0 && rect.right === rect.map.width
    return deletesAllColumns ? deleteEnclosingTable()(state, dispatch, view) : deleteColumn(state, dispatch)
  }
}

/** True when the current selection is a rectangular multi-cell CellSelection that can be
 * merged — the exact condition `mergeCells` itself checks (a dispatch-less run is a pure
 * availability probe, ProseMirror convention). Drives the "Zellen verbinden" button state. */
export function canMergeCells(state: EditorState): boolean {
  return mergeCells(state)
}

/** True when the selection is a single cell with colspan>1 and/or rowspan>1 that can be
 * split. Drives the "Zelle teilen" button state. */
export function canSplitCell(state: EditorState): boolean {
  return splitCell(state)
}

/**
 * After merge/split, prosemirror-tables leaves a `CellSelection` (not a text cursor). Typing
 * in that state would REPLACE the just-merged / just-restored content instead of appending
 * to it — the feature's most dangerous silent trap. This collapses the CellSelection to a
 * real text cursor at the end of the top-left cell's content, in the SAME transaction, so
 * immediate typing appends. See specs/zellen-verbinden-req.md §2.3 / §2.6.
 */
function collapseCellSelectionToCursor(tr: Transaction): Transaction {
  const sel = tr.selection
  if (!(sel instanceof CellSelection)) return tr
  let topLeft = Infinity
  sel.forEachCell((_node, pos) => {
    if (pos < topLeft) topLeft = pos
  })
  if (!isFinite(topLeft)) return tr
  const cellNode = tr.doc.nodeAt(topLeft)
  if (!cellNode) return tr
  const contentEnd = topLeft + 1 + cellNode.content.size
  return tr.setSelection(TextSelection.near(tr.doc.resolve(contentEnd), -1))
}

/** Merges the selected cells (content of all cells appended to the top-left anchor), then
 * places a text cursor at the end of the merged content (see {@link collapseCellSelectionToCursor}). */
export function mergeCellsWithCursor(): Command {
  return (state, dispatch) => {
    if (!mergeCells(state)) return false
    if (dispatch) {
      mergeCells(state, (tr) => dispatch(collapseCellSelectionToCursor(tr).scrollIntoView()))
    }
    return true
  }
}

/** Splits a merged cell into its C×R individual cells (original content stays in the
 * top-left cell), then places a text cursor at the end of that content. */
export function splitCellWithCursor(): Command {
  return (state, dispatch) => {
    if (!splitCell(state)) return false
    if (dispatch) {
      splitCell(state, (tr) => dispatch(collapseCellSelectionToCursor(tr).scrollIntoView()))
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

/** True when a non-empty selection exists (Text/Image/Cell/All) — the single
 * condition for enabling the "Ausschneiden" toolbar button/keybinding. */
export function canCut(state: EditorState): boolean {
  return !state.selection.empty
}

export interface CutHandlers {
  /** Called when the native cut attempt fails, so callers can show visible
   * feedback instead of silently losing the selection. */
  onCutBlocked?: (message: string) => void
}

/**
 * Cut command for access paths that don't already produce a native `cut` DOM
 * event (toolbar button click, `Shift-Delete`). Native Ctrl+X/Cmd+X and the
 * browser context menu do NOT go through this function — those already work
 * correctly via prosemirror-view's built-in `cut` event handler.
 *
 * Deliberately triggers `document.execCommand('cut')` instead of chaining our
 * own clipboard-write + delete: this reproduces the exact same, already
 * correct path used by native Ctrl+X (including image/cell/all selections)
 * and avoids the async Clipboard API on purpose, so there is never a
 * half-completed state where the clipboard was written but the deletion
 * failed (or vice versa).
 */
export function cutSelection(handlers: CutHandlers = {}): Command {
  return (state, dispatch, view) => {
    if (state.selection.empty) return false
    if (!dispatch || !view) return true // availability check only (e.g. for `disabled`)

    view.focus()

    // A NODE selection — in practice a selected image, whose NodeView wraps the <img> in a
    // contenteditable=false element — is a special case: touch/mobile Chromium's
    // execCommand('cut') does NOT fire a `cut` event for such a selection, so the node is
    // never deleted (verified deterministically on the Tablet project; the same reason a
    // synthetic Ctrl+X can leave a selected image behind under CI load, cut.spec.ts:228/570).
    // Guarantee the removal with an explicit ProseMirror transaction — exactly the deletion
    // prosemirror-view's own native `cut` handler performs — while still writing the clipboard
    // best-effort through the sanctioned native `copy` path (never navigator.clipboard, per the
    // privacy invariant). Deletion is deterministic and the copy happens first, so there is
    // never a "clipboard written but not deleted" (or the reverse) half-state; on engines that
    // refuse to copy a non-editable node selection the image is still reliably removed.
    if (state.selection instanceof NodeSelection) {
      try {
        view.dom.ownerDocument.execCommand('copy')
      } catch {
        // best-effort clipboard write; the deletion below is what must not be skipped
      }
      dispatch(state.tr.deleteSelection().scrollIntoView())
      return true
    }

    let succeeded = false
    try {
      succeeded = view.dom.ownerDocument.execCommand('cut')
    } catch {
      succeeded = false
    }
    if (!succeeded) {
      handlers.onCutBlocked?.('Ausschneiden wurde vom Browser blockiert. Es wurde nichts verändert.')
    }
    return succeeded
  }
}

