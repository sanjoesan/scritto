import type { ChangeEvent } from 'react'
import type { EditorView } from 'prosemirror-view'
import { toggleMark } from 'prosemirror-commands'
import { wordSchema } from '../schema'
import {
  applyMarkColor,
  clearMarkColor,
  insertImage,
  insertTable,
  isAlignActive,
  isInTable,
  liftFromList,
  setAlign,
  setHeading,
  toggleList,
  type Align,
} from './commands'

interface ToolbarProps {
  view: EditorView
}

function run(view: EditorView, command: (state: typeof view.state, dispatch: typeof view.dispatch) => boolean) {
  command(view.state, view.dispatch)
  view.focus()
}

function MarkButton({ view, mark, label, title }: { view: EditorView; mark: string; label: string; title: string }) {
  const markType = wordSchema.marks[mark]
  const active = markType.isInSet(view.state.selection.$from.marks()) !== undefined
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => {
        e.preventDefault()
        run(view, toggleMark(markType))
      }}
      className={`px-2 py-1 rounded text-sm font-medium border ${
        active
          ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900'
          : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
      }`}
    >
      {label}
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

export function Toolbar({ view }: ToolbarProps) {
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

      <MarkButton view={view} mark="strong" label="F" title="Fett" />
      <MarkButton view={view} mark="em" label="K" title="Kursiv" />
      <MarkButton view={view} mark="underline" label="U" title="Unterstrichen" />
      <MarkButton view={view} mark="strike" label="S" title="Durchgestrichen" />

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

      <button
        type="button"
        title="Tabelle einfügen"
        aria-pressed={isInTable(view.state)}
        onMouseDown={(e) => {
          e.preventDefault()
          run(view, insertTable(2, 2))
        }}
        className="px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
      >
        ⊞ Tabelle
      </button>

      <label className="px-2 py-1 rounded text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 cursor-pointer">
        🖼 Bild
        <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
      </label>
    </div>
  )
}
