import { useState } from 'react'

/**
 * Shown once per page load (never suppressed via storage — since nothing is
 * ever persisted, a returning visit after a reload is a brand new "session").
 */
export function PrivacyModal() {
  const [acknowledged, setAcknowledged] = useState(false)

  if (acknowledged) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-w-md rounded-lg bg-white dark:bg-neutral-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Wichtiger Hinweis zum Datenschutz
        </h2>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
          Scritto läuft vollständig in deinem Browser. Hochgeladene Dateien und Änderungen werden
          <strong> nirgendwo gespeichert</strong> und niemals an einen Server übertragen. Sie
          existieren nur im Arbeitsspeicher dieses Tabs.
        </p>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          Sobald du diese Seite schließt oder neu lädst, sind alle Dokumente und Änderungen
          <strong> unwiderruflich gelöscht</strong>. Exportiere deine Datei, bevor du die Seite
          verlässt.
        </p>
        <button
          type="button"
          onClick={() => setAcknowledged(true)}
          className="mt-5 w-full rounded-md bg-neutral-900 dark:bg-neutral-100 px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:opacity-90"
        >
          Verstanden
        </button>
      </div>
    </div>
  )
}
