import { useRef, useState } from 'react'
import type { AnyFormatModule, OpenDocument, PlannedFormat } from '../formats/types'

interface FormatPickerProps {
  modules: AnyFormatModule[]
  planned: PlannedFormat[]
  onOpen: (moduleId: string, doc: OpenDocument) => void
}

export function FormatPicker({ modules, planned, onOpen }: FormatPickerProps) {
  const [error, setError] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  async function handleFile(module: AnyFormatModule, file: File) {
    setError(null)
    try {
      const content = await module.importFile(file)
      onOpen(module.id, { fileName: file.name, content, dirty: false })
    } catch (err) {
      setError(
        `„${file.name}" konnte nicht als ${module.label} gelesen werden: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  function handleCreateNew(module: AnyFormatModule) {
    setError(null)
    const content = module.createNew()
    const ext = module.extensions[0] ?? ''
    onOpen(module.id, { fileName: `${module.defaultName}${ext}`, content, dirty: false })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-100">Papercut</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Dokumente hochladen, bearbeiten und wieder exportieren — komplett im Browser, ohne Server.
      </p>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 px-4 py-2 text-sm"
        >
          {error}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {modules.map((module) => (
          <div
            key={module.id}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 flex flex-col"
          >
            <h2 className="font-medium text-neutral-900 dark:text-neutral-100">{module.label}</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 flex-1">
              {module.description}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => fileInputs.current[module.id]?.click()}
                className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:opacity-90"
              >
                Datei hochladen
              </button>
              <button
                type="button"
                onClick={() => handleCreateNew(module)}
                className="rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Neu erstellen
              </button>
            </div>
            <input
              ref={(el) => {
                fileInputs.current[module.id] = el
              }}
              type="file"
              accept={[...module.extensions, ...module.mimeTypes].join(',')}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void handleFile(module, file)
              }}
            />
          </div>
        ))}

        {planned.map((format) => (
          <div
            key={format.id}
            className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 p-4 opacity-60"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-medium text-neutral-900 dark:text-neutral-100">{format.label}</h2>
              <span className="rounded bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                bald verfügbar
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {format.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
