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

export function WordEditor({ document: doc, onChange }: FormatEditorProps<WordDocumentContent>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return

    const bodyNode = wordSchema.nodeFromJSON(doc.content.body)
    const state = EditorState.create({
      doc: bodyNode,
      schema: wordSchema,
      plugins: [
        history(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
          Enter: splitListItem(wordSchema.nodes.list_item),
          'Mod-b': toggleMark(wordSchema.marks.strong),
          'Mod-i': toggleMark(wordSchema.marks.em),
          'Mod-u': toggleMark(wordSchema.marks.underline),
        }),
        keymap(baseKeymap),
        columnResizing(),
        tableEditing(),
        dropCursor(),
        gapCursor(),
        createPaginationPlugin(),
      ],
    })

    const view = new EditorView(containerRef.current, {
      state,
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
      {viewRef.current && <Toolbar view={viewRef.current} />}
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
