import type { Command, EditorState, Transaction } from 'prosemirror-state'
import { TextSelection, NodeSelection } from 'prosemirror-state'
import type { Node as PMNode, MarkType } from 'prosemirror-model'
import { wrapInList, liftListItem, sinkListItem } from 'prosemirror-schema-list'
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

/**
 * Whether the alignment button for `align` should read as active: ALL alignable blocks
 * touched by the selection carry it. A mixed multi-paragraph selection therefore lights up
 * NO alignment button instead of misleadingly showing the first block's state
 * (basis-stabilisierung-req.md B1 §2.1).
 */
export function isAlignActive(state: EditorState, align: Align): boolean {
  const { from, to, $from } = state.selection
  let sawBlock = false
  let allMatch = true
  state.doc.nodesBetween(from, to, (node) => {
    if (alignableTypes.has(node.type.name)) {
      sawBlock = true
      if (node.attrs.align !== align) allMatch = false
    }
  })
  if (sawBlock) return allMatch
  // Fallback (e.g. NodeSelection on an image): the nearest alignable ancestor decides.
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth)
    if (alignableTypes.has(node.type.name)) {
      return node.attrs.align === align
    }
  }
  return false
}

/**
 * Whole-range active state for a mark button (basis-stabilisierung-req.md B1 §2.1).
 * Collapsed cursor: the pending `storedMarks` (falling back to the marks at the cursor)
 * decide — so clicking "Fett" without a selection lights the button up immediately.
 * Range selection: active only when EVERY text node across EVERY selection range carries
 * the mark (Word semantics — a partially bold selection reads as "not bold"). Pairs with
 * `toggleMark(..., { removeWhenPresent: false })`, so an active button always means "the
 * next click turns it off".
 */
export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { empty, $from, ranges } = state.selection
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks())
  let sawText = false
  let allMarked = true
  for (const range of ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (!node.isText) return
      sawText = true
      if (!type.isInSet(node.marks)) allMarked = false
    })
  }
  return sawText && allMarked
}

/**
 * Whether the selection sits entirely inside a list of the given kind — drives the
 * aria-pressed/active state of the list toolbar buttons (B1 §2.1). For nested mixed
 * lists the innermost list around each selection end decides.
 */
export function isListActive(state: EditorState, ordered: boolean): boolean {
  const listType = ordered ? wordSchema.nodes.ordered_list : wordSchema.nodes.bullet_list
  const otherType = ordered ? wordSchema.nodes.bullet_list : wordSchema.nodes.ordered_list
  const { $from, $to } = state.selection
  const inList = ($pos: typeof $from) => {
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth)
      if (node.type === listType) return true
      if (node.type === otherType) return false
    }
    return false
  }
  return inList($from) && inList($to)
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

/** True when the selection sits inside a list_item at any depth (also lists in table
 * cells) — the "Listenkontext" that decides whether Tab/Shift+Tab change the list level
 * or fall through (specs/liste-einruecken-tab-req.md §2 #1/#2/#5). */
export function isInListItem(state: EditorState): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === wordSchema.nodes.list_item) return true
  }
  return false
}

/**
 * Tab in a list: nest the selected item(s) one level deeper under the previous sibling
 * (`sinkListItem`). Inside a list the key is ALWAYS consumed — even when sinking is
 * impossible (very first item, req §3.2): a visible no-op, but never a focus jump out
 * of the editor, and since sinkListItem doesn't dispatch then, no empty undo step
 * either (§3.8). Outside a list: `false`, the key falls through untouched (§2 #5 —
 * the plain-paragraph Tab behaviour is the separate `tabulator-zeichen` backlog item).
 */
export function indentListItem(): Command {
  return (state, dispatch, view) => {
    if (!isInListItem(state)) return false
    sinkListItem(wordSchema.nodes.list_item)(state, dispatch, view)
    return true
  }
}

/** Shift+Tab in a list: one level up; a top-level item leaves the list entirely —
 * identical to the "Liste aufheben" button (same liftListItem, req §3.5/§3.6). Same
 * consume semantics as indentListItem. */
export function outdentListItem(): Command {
  return (state, dispatch, view) => {
    if (!isInListItem(state)) return false
    liftListItem(wordSchema.nodes.list_item)(state, dispatch, view)
    return true
  }
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

/**
 * Inserts a manual, forced page break at the caret (specs/seitenumbruch-req.md §3.1/§3.2):
 * a selection is replaced, a caret mid-paragraph splits it like Enter (both halves keep
 * their block type — consistent with splitBlock, Grenzfall 6), and the caret ends up at
 * the start of the content after the break. Everything happens in ONE transaction = one
 * undo step (§3.9), with scrollIntoView (View-Sync).
 *
 * Inside a table cell or a list item the break degrades to a LINE break plus a visible
 * notice (§3.10, Grenzfälle 4/5): Word itself inserts a line break for Ctrl+Enter in a
 * cell, LibreOffice ignores in-cell page breaks outright (LO bug 35585, real fixtures
 * no_pagebreak.odt), and the block-level pagination (pagination.ts) cannot split a
 * table/list across pages anyway — a silent no-op or a torn structure are the two
 * outcomes this fallback avoids.
 */
export function insertPageBreak(onBlocked?: (message: string) => void): Command {
  return (state, dispatch) => {
    if (isInTable(state) || isInListItem(state)) {
      if (dispatch) {
        dispatch(state.tr.replaceSelectionWith(wordSchema.nodes.hard_break.create()).scrollIntoView())
        onBlocked?.(
          `Seitenumbruch ist innerhalb von ${isInTable(state) ? 'Tabellen' : 'Listen'} nicht möglich — Zeilenumbruch eingefügt.`,
        )
      }
      return true
    }
    if (!dispatch) return true

    let tr = state.tr
    if (!tr.selection.empty) tr = tr.deleteSelection()
    const $pos = tr.selection.$from
    let insertPos: number
    if ($pos.depth === 0) {
      // GapCursor at a top-level boundary (e.g. before/after an edge table) — that
      // boundary IS the insert position.
      insertPos = $pos.pos
    } else if ($pos.parentOffset > 0 && $pos.parentOffset < $pos.parent.content.size) {
      tr = tr.split($pos.pos, $pos.depth)
      insertPos = tr.selection.$from.before(1)
    } else if ($pos.parentOffset === 0) {
      insertPos = $pos.before(1)
    } else {
      insertPos = $pos.after(1)
    }
    tr = tr.insert(insertPos, wordSchema.nodes.page_break.create())
    const afterBreak = insertPos + 1
    if (afterBreak >= tr.doc.content.size) {
      // Break at the very end (Grenzfall 2): the new page needs a caret home — Word/
      // LibreOffice equally show a real empty page with an empty paragraph.
      tr = tr.insert(afterBreak, wordSchema.nodes.paragraph.create())
    }
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(afterBreak), 1)).scrollIntoView()
    dispatch(tr)
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

/**
 * Applies a colour mark to the selection — or, with a collapsed cursor, sets it as a
 * pending stored mark so the NEXT typed text carries the colour (writing-caret semantics,
 * parity with bold/italic; basis-stabilisierung-req.md B5 — the previous silent
 * `return false` no-op was the "Textfarbe bewirkt nichts" bug). `addToSet` replaces an
 * existing mark of the same type, so re-picking simply swaps the pending colour.
 */
export function applyMarkColor(markName: ColorMarkName, color: string): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    const mark = wordSchema.marks[markName].create({ color })
    if (dispatch) {
      if (empty) dispatch(state.tr.addStoredMark(mark))
      else dispatch(state.tr.addMark(from, to, mark))
    }
    return true
  }
}

/** Removes the colour from the selection — or, with a collapsed cursor, drops the pending/
 * inherited stored colour so the next typed text is uncoloured (B5, no silent no-op). */
export function clearMarkColor(markName: ColorMarkName): Command {
  return (state, dispatch) => {
    const { from, to, empty } = state.selection
    if (dispatch) {
      if (empty) dispatch(state.tr.removeStoredMark(wordSchema.marks[markName]))
      else dispatch(state.tr.removeMark(from, to, wordSchema.marks[markName]))
    }
    return true
  }
}

/**
 * The uniform colour of the given mark across the selection (or at the cursor, including a
 * pending stored mark); null when unset or mixed. Drives the toolbar swatch value so the
 * colour field reflects the document state instead of the last manually picked value
 * (basis-stabilisierung-req.md B1 §2.1 "Farbfelder").
 */
export function activeColor(state: EditorState, markName: ColorMarkName): string | null {
  const type = wordSchema.marks[markName]
  const { empty, $from, ranges } = state.selection
  if (empty) {
    const mark = type.isInSet(state.storedMarks || $from.marks())
    return mark ? (mark.attrs.color as string) : null
  }
  let color: string | null | undefined
  for (const range of ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (!node.isText) return
      const mark = type.isInSet(node.marks)
      const nodeColor = mark ? (mark.attrs.color as string) : null
      if (color === undefined) color = nodeColor
      else if (color !== nodeColor) color = null // mixed → no uniform colour
    })
  }
  return color ?? null
}

// ---- Schriftart (specs/schriftart-waehlen-req.md) ------------------------------------

/**
 * Die aktive Schriftart der Selektion (req §1 #1/#8, §2.3): einheitlicher Mark-Name,
 * `null` = markloser Text (KEIN erfundener Default — harte Anforderung §2.4; das Feld
 * zeigt dann seinen neutralen Platzhalter), `'mixed'` = echt gemischte Selektion.
 */
export function activeFontFamily(state: EditorState): string | null | 'mixed' {
  const type = wordSchema.marks.fontFamily
  const { empty, $from, ranges } = state.selection
  if (empty) {
    const mark = type.isInSet(state.storedMarks || $from.marks())
    return mark ? (mark.attrs.family as string) : null
  }
  let family: string | null | undefined
  let mixed = false
  for (const range of ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node) => {
      if (!node.isText || mixed) return
      const mark = type.isInSet(node.marks)
      const nodeFamily = mark ? (mark.attrs.family as string) : null
      if (family === undefined) family = nodeFamily
      else if (family !== nodeFamily) mixed = true
    })
  }
  if (mixed) return 'mixed'
  return family ?? null
}

/** Alle im Dokument per Mark referenzierten Schriftarten in Auftrittsreihenfolge —
 * die Combobox-Gruppe „Im Dokument verwendet" (req §1 #4, Dedupe §3.24). */
export function documentFontFamilies(state: EditorState): string[] {
  const families: string[] = []
  state.doc.descendants((node) => {
    node.marks.forEach((mark) => {
      if (mark.type.name === 'fontFamily') {
        const family = mark.attrs.family as string
        if (!families.includes(family)) families.push(family)
      }
    })
    return true
  })
  return families
}

/** Setzt die Schriftart — an der Schreibmarke als storedMark (req §2.2, ausdrücklich
 * das toggleMark-Muster); alle selection.ranges in EINER Transaktion. Leere Namen
 * setzen nichts (Grenzfall 3.16 — der Aufrufer filtert zusätzlich). */
export function applyFontFamily(family: string): Command {
  return (state, dispatch) => {
    if (!family.trim()) return false
    const mark = wordSchema.marks.fontFamily.create({ family })
    if (dispatch) {
      const { empty, ranges } = state.selection
      let tr = state.tr
      if (empty) {
        tr = tr.addStoredMark(mark)
      } else {
        for (const range of ranges) tr = tr.addMark(range.$from.pos, range.$to.pos, mark)
      }
      dispatch(tr)
    }
    return true
  }
}

/** Entfernt den Schriftart-Mark (zurück zur Basisschrift); an der Schreibmarke wird die
 * Vormerkung zurückgenommen. Auf schriftartlosem Text ein No-Op ohne Exception (§1 #14). */
export function clearFontFamily(): Command {
  return (state, dispatch) => {
    const type = wordSchema.marks.fontFamily
    if (dispatch) {
      const { empty, ranges } = state.selection
      let tr = state.tr
      if (empty) {
        tr = tr.removeStoredMark(type)
      } else {
        for (const range of ranges) tr = tr.removeMark(range.$from.pos, range.$to.pos, type)
      }
      dispatch(tr)
    }
    return true
  }
}

// ---- Schriftgröße (specs/schriftgroesse-waehlen-req.md) ------------------------------

/** Implizite Vorlagen-Größen der Überschriften in pt (req §2.4) — identisch zu den
 * Werten, die beide Writer in ihre Vorlagen schreiben (docx/styleDefs.ts halbe Punkte
 * 48/40/36/32/28/26, odt/styleRegistry.ts dieselben pt-Werte). */
const HEADING_PT: Record<number, number> = { 1: 24, 2: 20, 3: 18, 4: 16, 5: 14, 6: 13 }

/** App-Standard NUR als UI-/Anzeige-Wert (req §3.4 — bewusst NICHT in den Export
 * geschrieben; „Kein Produktstandard" aus neues-dokument bleibt bestehen). */
export const DEFAULT_FONT_SIZE_PT = 11

/** Eingabe-Normalisierung (req §2.5): 0,5-pt-Raster, geclamped auf 1–400. Gilt für
 * Feld-Eingaben und externe Zwischenablagen-Werte — NIE für importierte Dateiwerte. */
export function clampFontSizeInput(pt: number): number | null {
  if (!Number.isFinite(pt) || pt <= 0) return null
  return Math.min(400, Math.max(1, Math.round(pt / 0.5) * 0.5))
}

function effectiveFontSizeAt($pos: { node(depth: number): PMNode; depth: number }): number {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (node.type.name === 'heading') return HEADING_PT[node.attrs.level as number] ?? DEFAULT_FONT_SIZE_PT
  }
  return DEFAULT_FONT_SIZE_PT
}

/**
 * Die EFFEKTIVE Schriftgröße der Selektion (req §1 #4, §2.3): expliziter fontSize-Mark,
 * sonst implizite Überschriften-Größe, sonst der 11-pt-Anzeige-Standard. Für eine
 * Range-Selektion werden die exakten pt-Werte JE LAUF verglichen (kein Runden vor dem
 * Vergleich — 10,3 neben 10,5 ist „gemischt"); uneinheitlich → null (Feld zeigt „—").
 */
export function activeFontSize(state: EditorState): number | null {
  const type = wordSchema.marks.fontSize
  const { empty, $from, ranges } = state.selection
  if (empty) {
    const mark = type.isInSet(state.storedMarks || $from.marks())
    return mark ? (mark.attrs.pt as number) : effectiveFontSizeAt($from)
  }
  let size: number | null | undefined
  for (const range of ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (!node.isText) return
      const mark = type.isInSet(node.marks)
      const nodeSize = mark ? (mark.attrs.pt as number) : effectiveFontSizeAt(state.doc.resolve(pos + 1))
      if (size === undefined) size = nodeSize
      else if (size !== nodeSize) size = null
    })
  }
  return size ?? null
}

/** Setzt die Schriftgröße — bei kollabierter Schreibmarke als storedMark für als
 * Nächstes getippten Text (req §2.2, ausdrücklich das toggleMark-Muster, NICHT das
 * frühere No-Op-Verhalten der Farb-Commands); alle selection.ranges in EINER
 * Transaktion = ein Undo-Schritt. */
export function setFontSize(pt: number): Command {
  return (state, dispatch) => {
    const mark = wordSchema.marks.fontSize.create({ pt })
    if (dispatch) {
      const { empty, ranges } = state.selection
      let tr = state.tr
      if (empty) {
        tr = tr.addStoredMark(mark)
      } else {
        for (const range of ranges) tr = tr.addMark(range.$from.pos, range.$to.pos, mark)
      }
      dispatch(tr)
    }
    return true
  }
}

/** Entfernt den expliziten fontSize-Mark (zurück zur Vorlagen-/Standardgröße); an der
 * Schreibmarke wird eine vorgemerkte Größe zurückgenommen. */
export function clearFontSize(): Command {
  return (state, dispatch) => {
    const type = wordSchema.marks.fontSize
    if (dispatch) {
      const { empty, ranges } = state.selection
      let tr = state.tr
      if (empty) {
        tr = tr.removeStoredMark(type)
      } else {
        for (const range of ranges) tr = tr.removeMark(range.$from.pos, range.$to.pos, type)
      }
      dispatch(tr)
    }
    return true
  }
}

/**
 * Normalises raw dialog input into a safe, usable href — or null when the input must be
 * rejected (specs/hyperlink-einfuegen-req.md §3.3, Grenzfall 4.9):
 * - leer/Whitespace → null (kein `href=""`),
 * - `javascript:`/`data:`/`vbscript:` (case-insensitive, auch mit eingestreutem
 *   Whitespace/Steuerzeichen) → null — XSS-Vektor über `toDOM`s `<a href>` und Export,
 * - http/https/mailto/tel → unverändert,
 * - ohne Schema (`beispiel.de/pfad`) → `https://` vorangestellt (Word-/Docs-Verhalten),
 * - alles Übrige (ftp:, relative Pfade, …) → Rohwert; eine Auflösung relativer Ziele
 *   wird nicht unterstützt, aber Eingaben dürfen nie crashen.
 */
export function normalizeLinkHref(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const schemeProbe = trimmed.replace(/[\s -]+/g, '').toLowerCase()
  if (/^(javascript|data|vbscript):/.test(schemeProbe)) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  if (/^[/.#]/.test(trimmed)) return trimmed // relativer Pfad/Anker: roh übernehmen
  return `https://${trimmed}`
}

/**
 * The contiguous linked range around the caret: mark boundaries decide the range, not
 * the cursor position (specs/hyperlink-einfuegen-req.md §3.4/§3.5). Null when the caret
 * is not inside a link.
 */
export function linkAtSelection(state: EditorState): { href: string; from: number; to: number } | null {
  const linkType = wordSchema.marks.link
  const { $from } = state.selection
  const probe = linkType.isInSet($from.marks())
  if (!probe) return null
  const href = probe.attrs.href as string
  // Inline-Läufe des Absatzes sind lückenlos — vom Lauf unter dem Cursor aus über
  // direkt angrenzende, GLEICH-verlinkte Läufe (z. B. teils fette Linkteile) wachsen.
  const parentStart = $from.start()
  const runs: Array<{ from: number; to: number; linked: boolean }> = []
  $from.parent.forEach((child, offset) => {
    const mark = linkType.isInSet(child.marks)
    runs.push({
      from: parentStart + offset,
      to: parentStart + offset + child.nodeSize,
      linked: !!mark && mark.attrs.href === href,
    })
  })
  const at = runs.findIndex((run) => run.linked && run.from <= $from.pos && $from.pos <= run.to)
  if (at < 0) return null
  let { from, to } = runs[at]
  for (let i = at - 1; i >= 0 && runs[i].linked; i--) from = runs[i].from
  for (let i = at + 1; i < runs.length && runs[i].linked; i++) to = runs[i].to
  return { href, from, to }
}

/**
 * Applies a link (specs/hyperlink-einfuegen-req.md §3.1/§3.2/§3.4) in ONE transaction:
 * - non-empty selection → the WHOLE selection gets the link (a mixed/partially linked
 *   selection becomes uniformly the new URL — same-type marks replace each other),
 * - collapsed caret INSIDE a link → edit: the new URL replaces the href on the whole
 *   contiguous linked range,
 * - collapsed caret elsewhere + `text` → the text is inserted at the caret, already
 *   linked (dialog's Anzeigetext field, §3.2b). Without text: no-op (`false`) — the
 *   dialog prevents this path by requiring the field.
 */
export function applyLink(href: string, text?: string): Command {
  return (state, dispatch) => {
    const linkType = wordSchema.marks.link
    const mark = linkType.create({ href })
    const { from, to, empty } = state.selection
    if (!empty) {
      if (dispatch) dispatch(state.tr.addMark(from, to, mark).scrollIntoView())
      return true
    }
    const existing = linkAtSelection(state)
    if (existing) {
      if (dispatch) dispatch(state.tr.addMark(existing.from, existing.to, mark).scrollIntoView())
      return true
    }
    if (!text || !text.trim()) return false
    if (dispatch) {
      const node = wordSchema.text(text, [...(state.storedMarks || state.selection.$from.marks()), mark])
      dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView())
    }
    return true
  }
}

/** Removes ONLY the link mark (§3.5): from the selection, or — with a collapsed caret
 * inside a link — from the whole contiguous linked range. Every other mark and the text
 * itself stay untouched. */
export function removeLink(): Command {
  return (state, dispatch) => {
    const linkType = wordSchema.marks.link
    const { from, to, empty } = state.selection
    if (!empty) {
      if (dispatch) dispatch(state.tr.removeMark(from, to, linkType).scrollIntoView())
      return true
    }
    const existing = linkAtSelection(state)
    if (!existing) return false
    if (dispatch) dispatch(state.tr.removeMark(existing.from, existing.to, linkType).scrollIntoView())
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

