import { useEffect, useRef, useState } from 'react'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo, redo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { splitListItem } from 'prosemirror-schema-list'
import { tableEditing, columnResizing } from 'prosemirror-tables'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { wordSchema } from '../schema'
import { cutSelection, insertHardBreak } from './commands'
import { clipboardTextSerializer } from './clipboard'
import { createPastePlugin } from './paste'
import { createPaginationPlugin } from './pagination'
import { pageBackgroundStyle, PAGE_WIDTH_PX, PAGE_HEIGHT_PX, PAGE_MARGIN_PX } from './pageLayout'
import { Toolbar } from './Toolbar'
import type { FormatEditorProps } from '../../types'
import type { WordDocumentContent } from '../documentModel'

/**
 * ProseMirror can fail to collapse a stale non-empty selection (e.g. an
 * `AllSelection` left over from Ctrl+A, or a selection whose surrounding
 * text just got re-wrapped by a toolbar command like Bold) when the user
 * then clicks to place the caret elsewhere — the DOM caret moves, but
 * `view.state.selection` doesn't. Left uncorrected, the *next* keystroke
 * (Enter, typing, ...) acts on that stale range instead of the new caret
 * position — e.g. Enter silently no-ops because commands like `splitBlock`
 * don't know how to split an `AllSelection`, and plain typing instead wipes
 * out and replaces the entire stale selection.
 *
 * Clicking *inside* an existing, non-collapsed selection does not reliably
 * collapse the browser's native selection by the time `mouseup` fires —
 * Chrome deliberately keeps it live (to support drag-to-move of the
 * selected text) unless the pointer actually moves before release. So
 * `document.getSelection().isCollapsed` cannot be used to detect "this was
 * a plain click": it is measured, not assumed. Instead, mousedown/mouseup
 * coordinates are compared — no meaningful movement between them means a
 * plain click, and the model selection is force-collapsed to that point via
 * `posAtCoords` regardless of what the native selection currently reports.
 * A real drag (mouseup far from mousedown) is left untouched so this never
 * fights ProseMirror's own handling of an actual drag-to-select.
 */
function reconcileSelectionOnClick(view: EditorView, event: MouseEvent) {
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!coords) return
  const newSelection = TextSelection.near(view.state.doc.resolve(coords.pos))
  if (!newSelection.eq(view.state.selection)) {
    view.dispatch(view.state.tr.setSelection(newSelection))
  }
}

/**
 * Auto-dismisses a transient, visible notice after `ms` — used by the
 * "Ausschneiden" error banner (red, role="alert"). `setValue` is a stable React
 * state setter, so the effect only re-runs when the message itself changes.
 */
function useAutoDismiss(value: string | null, setValue: (value: null) => void, ms = 4000) {
  useEffect(() => {
    if (!value) return
    const id = window.setTimeout(() => setValue(null), ms)
    return () => window.clearTimeout(id)
  }, [value, setValue, ms])
}

/** Compact zoom controls shown as a status bar below the page area. */
function ZoomBar({
  zoom,
  isFit,
  onZoomOut,
  onZoomIn,
  onFit,
  onActualSize,
}: {
  zoom: number
  isFit: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
  onActualSize: () => void
}) {
  // Touch targets ≥ 40px (UX-Invarianten §4 / specs/UX-INVARIANTEN.md).
  const btn =
    'min-w-10 min-h-10 px-2 rounded text-sm flex items-center justify-center border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
  return (
    <div className="flex items-center justify-end gap-1 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-2 py-1">
      <button type="button" aria-label="Verkleinern" title="Verkleinern" onClick={onZoomOut} className={btn}>
        −
      </button>
      <span aria-label="Zoomstufe" className="min-w-12 text-center text-xs tabular-nums text-neutral-600 dark:text-neutral-400">
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" aria-label="Vergrößern" title="Vergrößern" onClick={onZoomIn} className={btn}>
        +
      </button>
      <button
        type="button"
        onClick={onFit}
        aria-pressed={isFit}
        title="An Breite anpassen"
        className={`${btn} ${isFit ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : ''}`}
      >
        An Breite anpassen
      </button>
      <button type="button" onClick={onActualSize} title="Originalgröße (100%)" className={btn}>
        100%
      </button>
    </div>
  )
}

export function WordEditor({ document: doc, onChange }: FormatEditorProps<WordDocumentContent>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [, forceRender] = useState(0)
  const [cutError, setCutError] = useState<string | null>(null)
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)

  // Visible-but-transient feedback (never a permanent/blocking state).
  useAutoDismiss(cutError, setCutError)
  useAutoDismiss(pasteNotice, setPasteNotice)

  // ---- Zoom + responsive A4 fit (specs/dokument-darstellung-req.md §2.2/2.3) ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [availWidth, setAvailWidth] = useState(PAGE_WIDTH_PX)
  const [sheetHeight, setSheetHeight] = useState(PAGE_HEIGHT_PX)
  // null = auto-fit-to-width; a number = explicit user zoom (overrides auto until "Anpassen").
  const [userZoom, setUserZoom] = useState<number | null>(null)

  const ZOOM_MIN = 0.25
  const ZOOM_MAX = 3
  const GUTTER_PX = 24
  const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100))
  // Auto-fit: a viewport narrower than one A4 sheet (phone / narrow tablet) scales the
  // sheet down to the available width so nothing overflows horizontally; a wide viewport
  // caps at 100% and just centres the page.
  const fitZoom = Math.max(ZOOM_MIN, Math.min(1, (availWidth - GUTTER_PX) / PAGE_WIDTH_PX))
  const zoom = userZoom ?? fitZoom

  // Track the scroll container's available width and the sheet's natural (unscaled)
  // height. `offsetHeight` and ResizeObserver are both transform-invariant, so the
  // scaled footprint below reserves exactly the right space (correct scrolling +
  // centring, no mobile overflow) regardless of the current zoom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setAvailWidth(el.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return // jsdom / very old browsers
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const update = () => setSheetHeight(el.offsetHeight)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Ctrl/Cmd +/-/0 zoom, best-effort (the editor is the only surface mounted here).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        setUserZoom((z) => clampZoom((z ?? fitZoom) + 0.1))
      } else if (event.key === '-') {
        event.preventDefault()
        setUserZoom((z) => clampZoom((z ?? fitZoom) - 0.1))
      } else if (event.key === '0') {
        event.preventDefault()
        setUserZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitZoom])

  useEffect(() => {
    if (!containerRef.current) return

    const bodyNode = wordSchema.nodeFromJSON(doc.content.body)
    const state = EditorState.create({
      doc: bodyNode,
      schema: wordSchema,
      plugins: [
        history(),
        keymap({
          // Mod-c/Mod-x/Mod-v are deliberately NOT bound here: copy/cut/paste
          // run exclusively through ProseMirror's native clipboard default
          // handler (prosemirror-view, handlers.copy/cut/paste) plus the
          // `clipboardTextSerializer` set below. Any future keymap addition
          // must be checked against accidentally swallowing these via an
          // overly broad binding. See specs/kopieren-req.md Abschnitt 3,
          // specs/kopieren-code.md Abschnitt 8.
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
          Enter: splitListItem(wordSchema.nodes.list_item),
          'Shift-Enter': insertHardBreak(),
          'Mod-b': toggleMark(wordSchema.marks.strong),
          'Mod-i': toggleMark(wordSchema.marks.em),
          'Mod-u': toggleMark(wordSchema.marks.underline),
          // Windows' common secondary "cut" keybinding. Not something browsers
          // map to a native cut on a contenteditable by themselves (unlike
          // Ctrl+X/Cmd+X, which prosemirror-view already handles natively), so
          // it's bound explicitly to the same execCommand('cut') path as the
          // toolbar button (see commands.ts, specs/ausschneiden-code.md §3.3).
          'Shift-Delete': cutSelection({ onCutBlocked: setCutError }),
        }),
        keymap(baseKeymap),
        columnResizing(),
        tableEditing(),
        // Paste/drop pipeline: plain-text line semantics, HTML sanitisation,
        // external-image → placeholder, image-blob paste/drop, "paste without
        // formatting". `setPasteNotice` is a stable React setter, so wiring it in
        // the one-time init effect is safe. See specs/einfuegen-code.md 5.3.
        createPastePlugin({ onNotice: setPasteNotice }),
        dropCursor(),
        gapCursor(),
        createPaginationPlugin(),
      ],
    })

    // Rechtsklick "Ausschneiden": bewusst kein eigenes Kontextmenü und kein
    // `contextmenu`-Listener mit `preventDefault()` — das native
    // Browser-Kontextmenü bleibt erreichbar und sein "Ausschneiden"-Eintrag
    // nutzt denselben `editHandlers.cut`-Pfad wie Strg+X (siehe
    // specs/ausschneiden-code.md §1.4/§4, specs/ausschneiden-req.md Abschnitt 1).
    const view = new EditorView(containerRef.current, {
      state,
      clipboardTextSerializer,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) {
          onChangeRef.current({ ...doc.content, body: newState.doc.toJSON() })
        }
        forceRender((n) => n + 1)
      },
    })
    viewRef.current = view
    view.focus()
    forceRender((n) => n + 1)

    // A real drag needs a couple of pixels of intentional movement — a plain
    // click's mousedown/mouseup coordinates can differ by a pixel or two even
    // without any dragging (pointer jitter, sub-pixel rounding).
    const CLICK_DRAG_THRESHOLD_PX = 3
    let mouseDownPos: { x: number; y: number } | null = null
    const onMouseDown = (event: MouseEvent) => {
      mouseDownPos = { x: event.clientX, y: event.clientY }
    }
    const onMouseUp = (event: MouseEvent) => {
      const down = mouseDownPos
      mouseDownPos = null
      if (!down) return
      const movedPx = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      if (movedPx > CLICK_DRAG_THRESHOLD_PX) return
      reconcileSelectionOnClick(view, event)
    }
    view.dom.addEventListener('mousedown', onMouseDown)
    view.dom.addEventListener('mouseup', onMouseUp)

    return () => {
      view.dom.removeEventListener('mousedown', onMouseDown)
      view.dom.removeEventListener('mouseup', onMouseUp)
      view.destroy()
      viewRef.current = null
    }
    // Body content is only used to seed the initial state — ProseMirror owns
    // document identity from here on, re-syncing from props would fight it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col h-full">
      {viewRef.current && <Toolbar view={viewRef.current} cutError={cutError} setCutError={setCutError} />}
      {pasteNotice && (
        <div
          role="status"
          className="px-3 py-1.5 text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200"
        >
          {pasteNotice}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-neutral-200 dark:bg-neutral-950 py-6">
        {/* Scaled footprint: reserves the ZOOMED size so scroll + centring are correct
            and a phone viewport never overflows horizontally (auto-fit makes this ≤ the
            available width). `margin: 0 auto` centres it when it fits and lets it scroll
            when zoomed larger than the viewport. */}
        <div style={{ width: PAGE_WIDTH_PX * zoom, height: sheetHeight * zoom, margin: '0 auto' }}>
          <div
            ref={sheetRef}
            data-testid="page-sheet"
            style={{
              width: PAGE_WIDTH_PX,
              padding: `${PAGE_MARGIN_PX}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              ...pageBackgroundStyle(),
            }}
            className="shadow-lg"
          >
            <div ref={containerRef} className="word-editor-surface outline-none" />
          </div>
        </div>
      </div>
      <ZoomBar
        zoom={zoom}
        isFit={userZoom === null}
        onZoomOut={() => setUserZoom(clampZoom((userZoom ?? fitZoom) - 0.1))}
        onZoomIn={() => setUserZoom(clampZoom((userZoom ?? fitZoom) + 0.1))}
        onFit={() => setUserZoom(null)}
        onActualSize={() => setUserZoom(1)}
      />
    </div>
  )
}
