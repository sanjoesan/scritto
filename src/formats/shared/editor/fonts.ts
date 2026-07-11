// Kuratierte Schriftarten-Grundliste (schriftart-waehlen-req.md §1 #2): eine echte
// Auflistung installierter Systemschriften ist im Browser nicht portabel möglich —
// diese cross-platform sinnvolle Liste ist die verlässliche Basis; die Combobox
// (UI-Scheibe) ergänzt sie um „Im Dokument verwendet" und optional Local Font Access.

export type GenericFamily = 'serif' | 'sans-serif' | 'monospace'

export interface CuratedFont {
  family: string
  generic: GenericFamily
}

export const CURATED_FONTS: CuratedFont[] = [
  { family: 'Arial', generic: 'sans-serif' },
  { family: 'Calibri', generic: 'sans-serif' },
  { family: 'Comic Sans MS', generic: 'sans-serif' },
  { family: 'Courier New', generic: 'monospace' },
  { family: 'Georgia', generic: 'serif' },
  { family: 'Liberation Mono', generic: 'monospace' },
  { family: 'Liberation Sans', generic: 'sans-serif' },
  { family: 'Liberation Serif', generic: 'serif' },
  { family: 'Tahoma', generic: 'sans-serif' },
  { family: 'Times New Roman', generic: 'serif' },
  { family: 'Verdana', generic: 'sans-serif' },
]

/** Passende generische Fallback-Familie (req §2.6): kuratierter Eintrag, sonst eine
 * Namens-Heuristik — der Text bleibt auch ohne installierte Schrift sinnvoll lesbar. */
export function genericFallbackFor(family: string): GenericFamily {
  const curated = CURATED_FONTS.find((f) => f.family.toLowerCase() === family.toLowerCase())
  if (curated) return curated.generic
  if (/mono|courier|consol|code/i.test(family)) return 'monospace'
  if (/serif|times|georgia|garamond|book|roman|palatino/i.test(family)) return 'serif'
  return 'sans-serif'
}

/**
 * CSS-`font-family`-Deklaration für einen Schriftartnamen (req §2.7/Grenzfall 3.22):
 * der Name wird IMMER doppelt gequotet (innere `"` und `\` escaped — keine
 * CSS-Injection, kein Aufbrechen bei Komma/Sonderzeichen), gefolgt vom generischen
 * Fallback.
 */
export function cssFontFamily(family: string): string {
  const quoted = `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return `${quoted}, ${genericFallbackFor(family)}`
}

/**
 * Erster konkreter Schriftname aus einer CSS-`font-family`-Liste (parseDOM/Paste,
 * req Grenzfall 3.20): Quotes entfernt, generische Familien übersprungen; null, wenn
 * nur generische Angaben vorhanden sind.
 */
export function firstConcreteFamily(cssValue: string): string | null {
  for (const rawPart of cssValue.split(',')) {
    const part = stripSymmetricQuotes(rawPart.trim())
    if (!part) continue
    if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|math|emoji|fangsong)$/i.test(part)) continue
    return part
  }
  return null
}

/** Entfernt GENAU EIN symmetrisches Anführungszeichenpaar am Rand (req Grenzfall 3.25:
 * reale ODT-Dateien liefern svg:font-family teils als wörtliches `'Times New Roman'`).
 * Ein einzelnes Randzeichen — etwa ein Name, der absichtlich mit Apostroph endet —
 * bleibt unangetastet. */
export function stripSymmetricQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return value.slice(1, -1)
    }
  }
  return value
}
