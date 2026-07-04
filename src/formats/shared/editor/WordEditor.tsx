import { useEffect, useRef, useState } from 'react'
import { EditorState } from 'prosemirror-state'
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
    forceRender((n) => n + 1)

    return () => {
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
