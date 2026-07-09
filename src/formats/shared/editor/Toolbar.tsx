import type { ChangeEvent, ReactNode } from 'react'
import type { EditorView } from 'prosemirror-view'
import type { Command, EditorState } from 'prosemirror-state'
import { toggleMark } from 'prosemirror-commands'
import { wordSchema } from '../schema'
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  applyMarkColor,
  canCut,
  canDeleteTable,
  canMergeCells,
  canSplitCell,
  clearMarkColor,
  cutSelection,
  deleteColumnOrTable,
  deleteRowOrTable,
  deleteTableAtSelection,
  insertImage,
  isAlignActive,
  isInTable,
  liftFromList,
  mergeCellsWithCursor,
  setAlign,
  setHeading,
  splitCellWithCursor,
  toggleList,
  type Align,
} from './commands'

interface ToolbarProps {
  view: EditorView
  cutError: string | null
  setCutError: (message: string | null) => void
  /** Opens the table-size chooser (replaces the old fixed 2×2 insert). */
  onOpenTableDialog: () => void
}

function run(view: EditorView, command: Command) {
  command(view.state, view.dispatch, view)
  view.focus()
}

/**
 * Runs a table-structure command and scrolls the changed spot back into view
 * (View-Sync, specs/tabelle-struktur-bearbeiten-req.md §2.1–2.6): the affected cell must
 * stay visible after inserting/deleting a row or column, even in wide/long tables.
 */
function runTable(view: EditorView, command: Command) {
  command(view.state, (tr) => view.dispatch(tr.scrollIntoView()), view)
  view.focus()
}

function ScissorsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <line x1="8.2" y1="7.6" x2="20" y2="20" />
      <line x1="8.2" y1="16.4" x2="20" y2="4" />
    </svg>
  )
}

function MarkButton({
  view,
  mark,
  label,
  title,
  glyphClassName = '',
}: {
  view: EditorView
  mark: string
  label: string
  title: string
  glyphClassName?: string
}) {
  const markType = wordSchema.marks[mark]
  const active = markType.isInSet(view.state.selection.$from.marks()) !== undefined
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault()
        run(view, toggleMark(markType))
      }}
      className={`px-2 py-1 rounded text-sm border ${
        active
          ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900'
          : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
      }`}
    >
      <span className={glyphClassName}>{label}</span>
    </button>
  )
}

function AlignButton({ view, align, label }: { view: EditorView; align: Align; label: string }) {
  const active = isAlignActive(view.state, align)
  return (
    <button
      type="button"
      title={`Ausrichtung: ${align}`}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault()
        run(view, setAlign(align))
      }}
      className={`px-2 py-1 rounded text-sm border ${
        active
          ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900'
          : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
      }`}
    >
      {label}
    </button>
  )
}

function TableIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

// Six distinct inline-SVG icons (no emoji, req §1 #11). Row ops carry horizontal grid
// lines, column ops vertical ones; inserts show a "+" on the relevant edge, deletes an
// "✕" over the affected band — so above/below/left/right/insert/delete are all visually
// distinguishable, not only by tooltip.
const IconRowAbove = (
  <TableIcon>
    <rect x="3" y="9" width="18" height="12" rx="1.5" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <path d="M12 2.5v4M10 4.5h4" />
  </TableIcon>
)
const IconRowBelow = (
  <TableIcon>
    <rect x="3" y="3" width="18" height="12" rx="1.5" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <path d="M12 17.5v4M10 19.5h4" />
  </TableIcon>
)
const IconRowDelete = (
  <TableIcon>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <line x1="3" y1="9.5" x2="21" y2="9.5" />
    <line x1="3" y1="14.5" x2="21" y2="14.5" />
    <path d="M9.6 10.6l4.8 3.3M14.4 10.6l-4.8 3.3" />
  </TableIcon>
)
const IconColLeft = (
  <TableIcon>
    <rect x="7" y="3" width="14" height="18" rx="1.5" />
    <line x1="14" y1="3" x2="14" y2="21" />
    <path d="M2.5 12h4M4.5 10v4" />
  </TableIcon>
)
const IconColRight = (
  <TableIcon>
    <rect x="3" y="3" width="14" height="18" rx="1.5" />
    <line x1="10" y1="3" x2="10" y2="21" />
    <path d="M17.5 12h4M19.5 10v4" />
  </TableIcon>
)
const IconColDelete = (
  <TableIcon>
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <line x1="9.5" y1="3" x2="9.5" y2="21" />
    <line x1="14.5" y1="3" x2="14.5" y2="21" />
    <path d="M10.6 9.6l3.3 4.8M13.9 9.6l-3.3 4.8" />
  </TableIcon>
)
// "Delete whole table" — a full table (outline + internal grid lines) struck through by a
// bold X spanning the ENTIRE table corner-to-corner, so it reads as "remove the table" and is
// clearly distinct from the row/column deletes (whose X sits over a single band). req §1 #6.
const IconTableDelete = (
  <TableIcon>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="12" y1="4" x2="12" y2="20" />
    <path d="M4.5 5.5l15 13M19.5 5.5l-15 13" />
  </TableIcon>
)
// Merge = two arrows pointing inward (no divider); Split = a centre divider with two arrows
// pointing outward — opposites, distinguishable without the tooltip (req §1 #1/#2).
const IconMergeCells = (
  <TableIcon>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <path d="M4 12h5M7 10l2 2-2 2" />
    <path d="M20 12h-5M17 10l-2 2 2 2" />
  </TableIcon>
)
const IconSplitCell = (
  <TableIcon>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <line x1="12" y1="6" x2="12" y2="18" />
    <path d="M9 12H4M6 10l-2 2 2 2" />
    <path d="M15 12h5M18 10l2 2-2 2" />
  </TableIcon>
)

/**
 * A table toolbar button. Disabled (with a visible reason in title/aria-label) unless its
 * `isEnabled` predicate holds — defaults to `isInTable` (the condition for the six
 * insert/delete buttons, req §1 #7). Merge/split pass a stricter predicate (a dispatch-less
 * availability probe) plus a `disabledHint` explaining the selection requirement; when the
 * cursor isn't in a table at all, the not-in-a-table reason takes precedence (req §1 #5).
 * Mouse-down preventDefault preserves the editor selection and stops focus theft; the command
 * runs in onClick, which fires for a mouse click AND keyboard Enter/Space, with no
 * double-trigger (req §1 #8).
 */
function TableOpButton({
  view,
  command,
  label,
  children,
  isEnabled,
  disabledHint,
}: {
  view: EditorView
  command: Command
  label: string
  children: ReactNode
  isEnabled?: (state: EditorState) => boolean
  disabledHint?: string
}) {
  const enabled = (isEnabled ?? isInTable)(view.state)
  const reason = !isInTable(view.state)
    ? 'nur innerhalb einer Tabelle verfügbar'
    : (disabledHint ?? 'nur innerhalb einer Tabelle verfügbar')
  const title = enabled ? label : `${label} (${reason})`
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={!enabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => runTable(view, command)}
      className="grid place-items-center min-w-10 min-h-10 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

export function Toolbar({ view, cutError, setCutError, onOpenTableDialog }: ToolbarProps) {
  function currentHeadingLevel(): string {
    const { $from } = view.state.selection
    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name === 'heading') return String(node.attrs.level)
      if (node.type.name === 'paragraph') return 'normal'
    }
    return 'normal'
  }

  async function handleImagePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    run(view, insertImage(dataUrl, file.name))
  }

  return (
    <div
      role="toolbar"
      aria-label="Textformatierung"
      className="flex flex-wrap items-center gap-1 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-2 py-1.5"
    >
      <button
        type="button"
        title="Ausschneiden"
        aria-label="Ausschneiden"
        disabled={!canCut(view.state)}
        onMouseDown={(e) => {
          e.preventDefault()
          setCutError(null)
          run(view, cutSelection({ onCutBlocked: setCutError }))
        }}
        className="px-2 py-1 rounded text-sm border border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <ScissorsIcon />
      </button>
      {cutError && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400 max-w-[16rem] truncate">
          {cutError}
        </span>
      )}

      <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

      <select
        aria-label="Absatzformat"
        value={currentHeadingLevel()}
        onChange={(e) => {
          const value = e.target.value
          run(view, setHeading(value === 'normal' ? null : Number(value)))
        }}
        className="text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-1 py-1"
      >
        <option value="normal">Standard</option>
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <option key={level} value={level}>
            Überschrift {level}
          </option>
        ))}
      </select>

      <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

      <MarkButton view={view} mark="strong" label="F" title="Fett" glyphClassName="font-bold" />
      <MarkButton view={view} mark="em" label="K" title="Kursiv" glyphClassName="italic" />
      <MarkButton view={view} mark="underline" label="U" title="Unterstrichen" glyphClassName="underline" />
      <MarkButton view={view} mark="strike" label="S" title="Durchgestrichen" glyphClassName="line-through" />

      <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

      <label className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400" title="Textfarbe">
        <span aria-hidden>A</span>
        <input
          aria-label="Textfarbe"
          type="color"
          className="w-6 h-6 p-0 border-0 bg-transparent"
          onChange={(e) => run(view, applyMarkColor('textColor', e.target.value))}
        />
      </label>
      <button
        type="button"
        title="Textfarbe entfernen"
        onMouseDown={(e) => {
          e.preventDefault()
          run(view, clearMarkColor('textColor'))
        }}
        className="px-1.5 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
      >
        ⌫
      </button>
      <label className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400" title="Hervorhebungsfarbe">
        <span aria-hidden>🖍</span>
        <input
          aria-label="Hervorhebungsfarbe"
          type="color"
          className="w-6 h-6 p-0 border-0 bg-transparent"
          onChange={(e) => run(view, applyMarkColor('highlight', e.target.value))}
        />
      </label>
      <button
        type="button"
        title="Hervorhebung entfernen"
        onMouseDown={(e) => {
          e.preventDefault()
          run(view, clearMarkColor('highlight'))
        }}
        className="px-1.5 py-1 text-xs rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500"
      >
        ⌫
      </button>

      <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

      <AlignButton view={view} align="left" label="⇤" />
      <AlignButton view={view} align="center" label="↔" />
      <AlignButton view={view} align="right" label="⇥" />
      <AlignButton view={view} align="justify" label="≡" />

      <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

      <button
        type="button"
        title="Aufzählung"
        onMouseDown={(e) => {
          e.preventDefault()
          run(view, toggleList(false))
        }}
        className="px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
      >
        • Liste
      </button>
      <button
        type="button"
        title="Nummerierte Liste"
        onMouseDown={(e) => {
          e.preventDefault()
          run(view, toggleList(true))
        }}
        className="px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
      >
        1. Liste
      </button>
      <button
        type="button"
        title="Liste aufheben"
        onMouseDown={(e) => {
          e.preventDefault()
          run(view, liftFromList())
        }}
        className="px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
      >
        ⇧ Liste
      </button>

      <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

      {/* Opens the size chooser instead of inserting a fixed 2×2 (req §1 #1). onMouseDown
          preventDefault preserves the editor selection for the later insert; onClick fires for
          mouse, Enter AND Space — closing the long-standing Enter gap of the old mousedown-only
          button (req §0.1 / §2.15). */}
      <button
        type="button"
        title="Tabelle einfügen"
        aria-label="Tabelle einfügen"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onOpenTableDialog}
        className="px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
      >
        ⊞ Tabelle
      </button>

      {/* Tabelle löschen (specs/tabelle-erstellen-loeschen-req.md §2.8/§2.9): enabled whenever a
          table is affected — cursor inside one OR the whole table selected as a NodeSelection
          (the Backspace-after-table state that isInTable alone misses). */}
      <TableOpButton
        view={view}
        command={deleteTableAtSelection()}
        label="Tabelle löschen"
        isEnabled={canDeleteTable}
      >
        {IconTableDelete}
      </TableOpButton>

      {/* Tabellenstruktur bearbeiten (specs/tabelle-struktur-bearbeiten-req.md): one
          contiguous block, all six disabled outside a table. */}
      <TableOpButton view={view} command={addRowBefore} label="Zeile oberhalb einfügen">
        {IconRowAbove}
      </TableOpButton>
      <TableOpButton view={view} command={addRowAfter} label="Zeile unterhalb einfügen">
        {IconRowBelow}
      </TableOpButton>
      <TableOpButton view={view} command={deleteRowOrTable()} label="Zeile löschen">
        {IconRowDelete}
      </TableOpButton>
      <TableOpButton view={view} command={addColumnBefore} label="Spalte links einfügen">
        {IconColLeft}
      </TableOpButton>
      <TableOpButton view={view} command={addColumnAfter} label="Spalte rechts einfügen">
        {IconColRight}
      </TableOpButton>
      <TableOpButton view={view} command={deleteColumnOrTable()} label="Spalte löschen">
        {IconColDelete}
      </TableOpButton>

      <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

      {/* Zellen verbinden/teilen (specs/zellen-verbinden-req.md): enabled only when the
          selection actually allows the action; a text cursor is placed after merge/split
          so typing appends instead of replacing. */}
      <TableOpButton
        view={view}
        command={mergeCellsWithCursor()}
        label="Zellen verbinden"
        isEnabled={canMergeCells}
        disabledHint="mehrere benachbarte Zellen einer rechteckigen Fläche markieren"
      >
        {IconMergeCells}
      </TableOpButton>
      <TableOpButton
        view={view}
        command={splitCellWithCursor()}
        label="Zelle teilen"
        isEnabled={canSplitCell}
        disabledHint="nur bei einer bereits verbundenen Zelle verfügbar"
      >
        {IconSplitCell}
      </TableOpButton>

      <div className="w-px h-5 bg-neutral-300 dark:bg-neutral-700 mx-1" />

      <label className="px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 cursor-pointer">
        🖼 Bild
        <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
      </label>
    </div>
  )
}
