import { useEffect, useRef, useState } from 'react'

// Grid preview dimensions. The visible grid is a *mouse/touch accelerator* only; the full
// allowed range (1–20, TABLE_MAX) stays reachable via the number fields even beyond the grid
// (explicitly allowed by §2.3: the preview may be smaller than the maximum). 6×7 instead of
// the 8×10 example so every cell can be a ≥40px tap target (§1.11/§2.14) and the grid still
// fits the dialog card on a 412px-wide phone viewport.
// See specs/tabelle-erstellen-loeschen-req.md §2.2/§2.3.
const GRID_ROWS = 6
const GRID_COLS = 7
export const TABLE_MIN = 1
export const TABLE_MAX = 20
const DEFAULT_ROWS = 3
const DEFAULT_COLS = 3

/** Parses a number-field string to an integer in [TABLE_MIN, TABLE_MAX], or null if invalid. */
function parseDim(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n < TABLE_MIN || n > TABLE_MAX) return null
  return n
}

/**
 * Accessible "table size" chooser shown before a table is inserted (replaces the old fixed
 * 2×2 insert). Two equivalent inputs writing the same state (§2.2): labelled number fields
 * "Zeilen"/"Spalten" (the guaranteed keyboard/screen-reader path) and a hover/tap grid
 * (a mouse/touch accelerator, deliberately not itself keyboard-navigable — the fields cover
 * that, §1.4). A grid-cell click inserts immediately; the fields insert on "Einfügen"/Enter
 * after validation. Escape / "Abbrechen" / click outside close without inserting. The dialog
 * traps focus and — via the parent's onClose/onInsert — returns focus to the editor.
 * specs/tabelle-erstellen-loeschen-req.md §2.1–2.4, §2.15.
 */
export function TableSizeDialog({
  onInsert,
  onClose,
}: {
  onInsert: (rows: number, cols: number) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState(String(DEFAULT_ROWS))
  const [cols, setCols] = useState(String(DEFAULT_COLS))
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

  // Focus the first field on open (§2.1). Focus is returned to the editor by the parent when
  // onInsert/onClose runs (it owns the EditorView).
  useEffect(() => {
    firstFieldRef.current?.focus()
    firstFieldRef.current?.select()
  }, [])

  // Grid highlight is derived from the (clamped) field values, so hovering — which writes the
  // fields — and typing stay in one source of truth. Invalid field text simply highlights
  // nothing.
  const hiRows = parseDim(rows)
  const hiCols = parseDim(cols)

  const commitFields = () => {
    const r = parseDim(rows)
    const c = parseDim(cols)
    if (r == null || c == null) {
      setError(`Bitte für Zeilen und Spalten je eine ganze Zahl von ${TABLE_MIN} bis ${TABLE_MAX} angeben.`)
      return
    }
    onInsert(r, c)
  }

  const onCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    // Focus trap: cycle only among the real tab stops (the two fields + the two buttons). Grid
    // cells are tabIndex=-1 and excluded.
    const focusables = Array.from(
      cardRef.current?.querySelectorAll<HTMLElement>('input, button:not([tabindex="-1"])') ?? [],
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = cardRef.current?.ownerDocument.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const fieldClass =
    'w-16 min-h-10 px-2 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100'

  return (
    // Backdrop. A mousedown that lands on the backdrop itself (not the card) closes without
    // inserting (§2.1). mousedown (not click) so it fires before focus churn.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tabelle einfügen"
        onKeyDown={onCardKeyDown}
        className="w-full max-w-sm rounded-lg bg-white dark:bg-neutral-900 shadow-xl border border-neutral-200 dark:border-neutral-700 p-4 flex flex-col gap-4"
      >
        <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-100">Tabelle einfügen</h2>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300">
            Zeilen
            <input
              ref={firstFieldRef}
              type="number"
              inputMode="numeric"
              aria-label="Zeilen"
              min={TABLE_MIN}
              max={TABLE_MAX}
              step={1}
              className={fieldClass}
              value={rows}
              onChange={(e) => {
                setError(null)
                setRows(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitFields()
                }
              }}
            />
          </label>
          <span className="min-h-10 flex items-center text-neutral-400" aria-hidden="true">
            ×
          </span>
          <label className="flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300">
            Spalten
            <input
              type="number"
              inputMode="numeric"
              aria-label="Spalten"
              min={TABLE_MIN}
              max={TABLE_MAX}
              step={1}
              className={fieldClass}
              value={cols}
              onChange={(e) => {
                setError(null)
                setCols(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitFields()
                }
              }}
            />
          </label>
        </div>

        {/* Grid accelerator (mouse/touch). Hovering writes the fields; a click/tap inserts at
            once. Not a keyboard tab stop by design (§1.4). */}
        <div
          className="inline-grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 2.5rem)` }}
          aria-hidden="true"
        >
          {Array.from({ length: GRID_ROWS }).map((_, r) =>
            Array.from({ length: GRID_COLS }).map((_, c) => {
              const active = hiRows != null && hiCols != null && r < hiRows && c < hiCols
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  tabIndex={-1}
                  title={`${r + 1} × ${c + 1}`}
                  onMouseEnter={() => {
                    setError(null)
                    setRows(String(r + 1))
                    setCols(String(c + 1))
                  }}
                  onClick={() => onInsert(r + 1, c + 1)}
                  className={`h-10 w-10 rounded-sm border ${
                    active
                      ? 'bg-blue-500 border-blue-600'
                      : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600'
                  }`}
                />
              )
            }),
          )}
        </div>
        <p className="text-sm tabular-nums text-neutral-600 dark:text-neutral-400" aria-hidden="true">
          {hiRows != null && hiCols != null ? `${hiRows} × ${hiCols}` : '—'}
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-3 rounded border border-neutral-300 dark:border-neutral-600 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={commitFields}
            className="min-h-10 px-3 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            Einfügen
          </button>
        </div>
      </div>
    </div>
  )
}
