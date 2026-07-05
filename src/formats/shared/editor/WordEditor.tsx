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
import { pageBackgroundStyle, PAGE_WIDTH_PX, PAGE_MARGIN_PX } from './pageLayout'
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
      <div className="flex-1 overflow-auto bg-neutral-200 dark:bg-neutral-950 flex justify-center py-8">
        <div
          style={{
            width: PAGE_WIDTH_PX,
            padding: `${PAGE_MARGIN_PX}px`,
            ...pageBackgroundStyle(),
          }}
          className="shadow-lg"
        >
          <div ref={containerRef} className="word-editor-surface outline-none" />
        </div>
      </div>
    </div>
  )
}
