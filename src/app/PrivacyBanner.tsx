export function PrivacyBanner() {
  return (
    <div
      role="status"
      className="w-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 text-sm px-4 py-2 text-center border-b border-amber-300 dark:border-amber-800"
    >
      Alle Dateien werden ausschließlich im Arbeitsspeicher deines Browsers gehalten. Nichts wird
      gespeichert oder übertragen — beim Schließen oder Neuladen dieser Seite gehen alle Änderungen
      unwiderruflich verloren. Bitte rechtzeitig exportieren.
    </div>
  )
}
