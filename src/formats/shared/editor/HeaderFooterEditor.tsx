import { useEffect, useRef } from 'react'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo, redo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { splitListItem } from 'prosemirror-schema-list'
import { gapCursor } from 'prosemirror-gapcursor'
import { dropCursor } from 'prosemirror-dropcursor'
import { Node as PMNode } from 'prosemirror-model'
import { wordSchema, type ProseMirrorJSON } from '../schema'

/**
 * Editierbarer Kopf-/Fußzeilenbereich (kopfzeile-/fusszeile-bearbeiten-req.md §1 #3):
 * eine ZWEITE (bzw. dritte) EditorView über dasselbe wordSchema, gespeist aus
 * `document.header`/`document.footer`. Eigene, unabhängige Undo-Historie (Word-analog:
 * Strg+Z im Kopfzeilenmodus wirkt auf die Kopfzeile); bewusst OHNE Paginierung,
 * Suche und Seitenumbruch-Command — das sind Body-Konzepte. Der Klick-Reconciler aus
 * dem Haupteditor ist hier repliziert (req §2/Grenzfall 9: zweite Instanz = zweiter
 * Verdachtsfall derselben Selection-Sync-Fehlerklasse).
 */
export function HeaderFooterEditor({
  kind,
  content,
  onChange,
  onFocusChange,
}: {
  kind: 'header' | 'footer'
  content: ProseMirrorJSON
  onChange: (json: ProseMirrorJSON) => void
  onFocusChange: (view: EditorView | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onFocusChangeRef = useRef(onFocusChange)
  onFocusChangeRef.current = onFocusChange

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const state = EditorState.create({
      doc: PMNode.fromJSON(wordSchema, content as Parameters<typeof PMNode.fromJSON>[1]),
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
        gapCursor(),
        dropCursor(),
      ],
    })

    const view = new EditorView(container, {
      state,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) onChangeRef.current(newState.doc.toJSON() as ProseMirrorJSON)
      },
      handleDOMEvents: {
        focus: () => {
          onFocusChangeRef.current(view)
          return false
        },
      },
    })
    viewRef.current = view

    // Klick-Reparatur wie im Haupteditor (basis-stabilisierung B3): nur Klicks, die bis
    // mouseup KEINE Modell-Selektionsänderung ausgelöst haben, werden nachgezogen.
    const CLICK_DRAG_THRESHOLD_PX = 3
    let mouseDownPos: { x: number; y: number } | null = null
    let selectionAtMouseDown = view.state.selection
    const onMouseDown = (event: MouseEvent) => {
      mouseDownPos = { x: event.clientX, y: event.clientY }
      selectionAtMouseDown = view.state.selection
    }
    const onMouseUp = (event: MouseEvent) => {
      const down = mouseDownPos
      mouseDownPos = null
      if (!down) return
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_DRAG_THRESHOLD_PX) return
      if (!view.state.selection.eq(selectionAtMouseDown)) return
      const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!coords) return
      const selection = TextSelection.near(view.state.doc.resolve(coords.pos))
      if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection))
    }
    view.dom.addEventListener('mousedown', onMouseDown)
    view.dom.addEventListener('mouseup', onMouseUp)

    view.focus()
    onFocusChangeRef.current(view)

    return () => {
      view.dom.removeEventListener('mousedown', onMouseDown)
      view.dom.removeEventListener('mouseup', onMouseUp)
      onFocusChangeRef.current(null)
      view.destroy()
      viewRef.current = null
    }
    // Inhalt seedet nur den Initialzustand — die View besitzt das Dokument danach selbst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const label = kind === 'header' ? 'Kopfzeile' : 'Fußzeile'
  return (
    <div
      data-testid={`${kind}-editor`}
      className={`px-1 ${kind === 'header' ? 'border-b' : 'border-t'} border-dashed border-neutral-300`}
    >
      {kind === 'footer' && <div ref={containerRef} className="hf-editor-surface outline-none" />}
      <div aria-hidden className="text-[10px] uppercase tracking-wide text-neutral-400 select-none">
        {label}
      </div>
      {kind === 'header' && <div ref={containerRef} className="hf-editor-surface outline-none" />}
    </div>
  )
}

/** Leeres Kopf-/Fußzeilen-Dokument (ein leerer Absatz — `doc` verlangt `block+`). */
export function emptyHeaderFooter(): ProseMirrorJSON {
  return { type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'left' } }] } as ProseMirrorJSON
}
