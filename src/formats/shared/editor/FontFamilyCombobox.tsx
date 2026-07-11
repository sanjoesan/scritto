import { useRef, useState } from 'react'
import type { EditorView } from 'prosemirror-view'
import { activeFontFamily, applyFontFamily, clearFontFamily, documentFontFamilies } from './commands'
import { CURATED_FONTS, cssFontFamily } from './fonts'

// Local Font Access API (nur Chromium; Firefox/Safari haben sie nicht — dokumentiertes
// Fallback auf die kuratierte Liste, req §1 #3/§3.12). Das Ergebnis wird pro Tab
// gecacht, damit höchstens EIN Berechtigungsdialog entsteht (req §4.5).
let localFontsCache: string[] | 'unavailable' | null = null
async function loadLocalFonts(): Promise<string[]> {
  if (Array.isArray(localFontsCache)) return localFontsCache
  if (localFontsCache === 'unavailable') return []
  const query = (window as { queryLocalFonts?: () => Promise<Array<{ family: string }>> }).queryLocalFonts
  if (!query) {
    localFontsCache = 'unavailable'
    return []
  }
  try {
    const fonts = await query.call(window)
    const families = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b, 'de'))
    localFontsCache = families
    return families
  } catch {
    // Berechtigung verweigert/API-Fehler → kuratierte Liste bleibt allein aktiv (§3.12).
    localFontsCache = 'unavailable'
    return []
  }
}

const IconClearFont = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M6 20h12" />
    <path d="M9.5 15.5 14 4h1l4.5 11.5" />
    <path d="M4 6l6 6M10 6l-6 6" />
  </svg>
)

interface Group {
  label: string
  families: string[]
}

/**
 * Schriftart-Combobox (schriftart-waehlen-req.md §1, ARIA nach §4.6): editierbares
 * Eingabefeld + eigene Options-Liste mit den Gruppen „Im Dokument verwendet" (Vorrang
 * bei Dedupe, §3.24) und „Schriftarten" (kuratiert, optional um Local-Font-Access-
 * Ergebnisse erweitert). Tippen filtert live (Teilstring, case-insensitive); kein
 * Treffer → sichtbarer, per aria-live angesagter Hinweis. Enter übernimmt den
 * hervorgehobenen bzw. frei eingetippten Namen, Escape/Blur/Tab schließen OHNE stille
 * Übernahme (§1 #7, §4.4/§4.8). Bei gemischter Selektion bleibt das Feld leer (§1 #8);
 * für marklosen Text wird KEIN Default erfunden (§2.4).
 */
export function FontFamilyCombobox({ view }: { view: EditorView }) {
  const active = activeFontFamily(view.state)
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  // true erst nach echter Pfeilnavigation: Enter übernimmt sonst den GETIPPTEN Wert,
  // nie stillschweigend den nur zufällig hervorgehobenen Listeneintrag (§1 #7).
  const [navigated, setNavigated] = useState(false)
  const [localFonts, setLocalFonts] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  const shown = draft ?? (typeof active === 'string' && active !== 'mixed' ? active : '')
  const filter = (draft ?? '').trim().toLowerCase()

  const docFonts = documentFontFamilies(view.state)
  const curatedPlusLocal = [...new Set([...CURATED_FONTS.map((f) => f.family), ...localFonts])].sort((a, b) =>
    a.localeCompare(b, 'de'),
  )
  const groups: Group[] = [
    { label: 'Im Dokument verwendet', families: docFonts },
    { label: 'Schriftarten', families: curatedPlusLocal.filter((f) => !docFonts.includes(f)) },
  ]
    .map((group) => ({
      ...group,
      families: filter ? group.families.filter((f) => f.toLowerCase().includes(filter)) : group.families,
    }))
    .filter((group) => group.families.length > 0)
  const flat = groups.flatMap((g) => g.families)
  const highlightIndex = Math.min(highlight, Math.max(0, flat.length - 1))

  const close = () => {
    setOpen(false)
    setDraft(null)
    setHighlight(0)
    setNavigated(false)
  }

  const commit = (family: string) => {
    const trimmed = family.trim()
    close()
    if (!trimmed) return // leere Eingabe: No-Op, Anzeigewert kehrt zurück (Grenzfall 3.16)
    applyFontFamily(trimmed)(view.state, view.dispatch)
    view.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        void loadLocalFonts().then(setLocalFonts)
        return
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setNavigated(true)
      setHighlight((h) => Math.min(Math.max(0, h + delta), Math.max(0, flat.length - 1)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && navigated && flat[highlightIndex]) commit(flat[highlightIndex])
      else commit(draft ?? shown)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
    // Tab: Standard-Fokuswechsel — onBlur unten schließt ohne Übernahme (§4.8).
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-0.5">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="font-family-listbox"
        aria-label="Schriftart"
        type="text"
        placeholder="Schriftart"
        className="w-32 min-h-8 px-1.5 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 text-sm"
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value)
          setHighlight(0)
          if (!open) {
            setOpen(true)
            void loadLocalFonts().then(setLocalFonts)
          }
        }}
        onClick={() => {
          if (!open) {
            setOpen(true)
            void loadLocalFonts().then(setLocalFonts)
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Optionen-Klicks lösen dank mousedown-preventDefault gar keinen Blur aus —
          // jeder echte Fokusverlust (Klick außerhalb, Tab aufs nächste Element, auch
          // den Entfernen-Button) schließt OHNE stille Übernahme (§4.4/§4.8).
          close()
        }}
      />
      <button
        type="button"
        title="Schriftart entfernen"
        aria-label="Schriftart entfernen"
        disabled={active === null}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          clearFontFamily()(view.state, view.dispatch)
          view.focus()
        }}
        className="px-1 py-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {IconClearFont}
      </button>

      {open && (
        <div
          id="font-family-listbox"
          role="listbox"
          aria-label="Schriftarten"
          className="absolute left-0 top-full z-40 mt-1 max-h-72 w-56 overflow-y-auto rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-lg py-1"
        >
          {flat.length === 0 && (
            <div aria-live="polite" className="px-2 py-1.5 text-sm text-neutral-500">
              Keine Schriftart gefunden
            </div>
          )}
          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <div role="presentation" className="px-2 pt-1.5 pb-0.5 text-xs uppercase tracking-wide text-neutral-400">
                {group.label}
              </div>
              {group.families.map((family) => {
                const index = flat.indexOf(family)
                return (
                  <div
                    key={family}
                    role="option"
                    aria-selected={index === highlightIndex}
                    style={{ fontFamily: cssFontFamily(family) }}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => commit(family)}
                    className={`px-2 py-1.5 text-sm cursor-pointer ${
                      index === highlightIndex
                        ? 'bg-blue-600 text-white'
                        : 'text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {family}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
