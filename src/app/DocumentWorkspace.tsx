import { useState } from 'react'
import type { AnyFormatModule, OpenDocument } from '../formats/types'
import { downloadBlob } from '../lib/download'

interface DocumentWorkspaceProps {
  module: AnyFormatModule
  document: OpenDocument
  onChange: (doc: OpenDocument) => void
  onClose: () => void
}

export function DocumentWorkspace({ module, document, onChange, onClose }: DocumentWorkspaceProps) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const Editor = module.editor

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const blob = await module.exportFile(document.content, document.fileName)
      downloadBlob(blob, document.fileName)
      onChange({ ...document, dirty: false })
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  function handleClose() {
    if (document.dirty && !window.confirm('Nicht exportierte Änderungen gehen verloren. Trotzdem schließen?')) {
      return
    }
    onClose()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ← Formate
          </button>
          <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {document.fileName}
          </span>
          {document.dirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400">● ungespeichert</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {exportError && <span className="text-xs text-red-600 dark:text-red-400">{exportError}</span>}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? 'Exportiere…' : 'Exportieren'}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Editor document={document} onChange={(content) => onChange({ ...document, content, dirty: true })} />
      </div>
    </div>
  )
}
