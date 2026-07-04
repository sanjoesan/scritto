import { useEffect, useRef, useState } from 'react'
import type { AnyFormatModule, OpenDocument } from '../formats/types'
import { downloadBlob } from '../lib/download'

interface DocumentWorkspaceProps {
  module: AnyFormatModule
  document: OpenDocument
  onChange: (doc: OpenDocument) => void
  onClose: () => void
}

declare global {
  interface Window {
    /**
     * Test-only hook, present only when the app is built with
     * `VITE_ENABLE_TEST_HOOKS=true` (see vite.config.ts/playwright.config.ts) — absent
     * entirely (dead-code-eliminated) from production builds. Lets a real Playwright
     * click on "Exportieren" force a genuine failure through the real `handleExport`
     * try/catch/finally, for Testfall 12 (specs/speichern-exportieren-req.md Abschnitt
     * 6/7: "Erzwungener Serialisierungsfehler … über echte Browser-Bedienung").
     */
    __testHooks__?: {
      /** Arms a one-shot failure: the *next* export call fails with `message`, then the
       * hook disarms itself so a subsequent export (retry) proceeds normally. */
      forceNextExportError: (message?: string) => void
    }
  }
}

export function DocumentWorkspace({ module, document, onChange, onClose }: DocumentWorkspaceProps) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const Editor = module.editor

  // Synchronous re-entrancy guard: `disabled={exporting}` only protects the button
  // once React has committed the state update and re-rendered. Two synchronously
  // fired clicks (fast double-click, synthetic events) can both call handleExport()
  // before the DOM reflects `disabled`, which would otherwise start two overlapping
  // exportFile()/downloadBlob() cycles from a single logical click. A ref is checked
  // and set before any `await`, so the second call returns immediately.
  const exportingRef = useRef(false)

  // Tracks the latest `document` prop so a long-running export can compare "the
  // content I exported" against "the content that exists now" once it resolves —
  // without this, editing while an export is in flight would have the export's
  // `onChange({ ...document, dirty: false })` overwrite newer edits with the stale
  // snapshot it closed over, plus incorrectly clear `dirty`.
  const documentRef = useRef(document)
  documentRef.current = document

  // One-shot forced-failure flag for Testfall 12 (see the `__testHooks__` type above).
  // Only ever set from outside via `window.__testHooks__.forceNextExportError`, which
  // itself is only ever installed when `__ENABLE_TEST_HOOKS__` is true.
  const forceExportErrorRef = useRef<string | null>(null)

  useEffect(() => {
    if (!__ENABLE_TEST_HOOKS__) return
    window.__testHooks__ = {
      forceNextExportError: (message) => {
        forceExportErrorRef.current = message ?? 'Erzwungener Testfehler (forceNextExportError)'
      },
    }
    return () => {
      delete window.__testHooks__
    }
  }, [])

  async function handleExport() {
    if (exportingRef.current) return
    exportingRef.current = true
    setExporting(true)
    setExportError(null)
    const snapshot = documentRef.current
    // Consumed exactly once regardless of outcome: arming always fails this one call, a
    // subsequent export (retry) is unaffected.
    const forcedError = forceExportErrorRef.current
    forceExportErrorRef.current = null
    try {
      const blob = forcedError !== null
        ? await Promise.reject<Blob>(new Error(forcedError))
        : await module.exportFile(snapshot.content, snapshot.fileName)
      downloadBlob(blob, snapshot.fileName)
      if (documentRef.current.content === snapshot.content) {
        onChange({ ...documentRef.current, dirty: false })
      }
      // else: the document was edited while the export was in flight — the just
      // downloaded file no longer matches the current editor state, so `dirty`
      // is deliberately left untouched (still `true`) rather than falsely cleared.
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err))
    } finally {
      exportingRef.current = false
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
            // In Chromium (unlike WebKit), a mouse click focuses the <button> it lands
            // on by default. handleExport() synchronously sets `exporting`, which makes
            // this button `disabled` — and a browser force-blurs a focused element that
            // becomes disabled. With nothing to return focus afterwards, it lands on
            // <body>, so typing right after export (without clicking back into the
            // editor first) silently went nowhere (Testfall 5, speichern-exportieren
            // QA finding "Fund 1"). Preventing the default mousedown focus behavior —
            // the same pattern already used by every toolbar button in Toolbar.tsx —
            // keeps focus in the editor throughout the whole export, so it's never
            // there to lose in the first place.
            onMouseDown={(e) => e.preventDefault()}
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
