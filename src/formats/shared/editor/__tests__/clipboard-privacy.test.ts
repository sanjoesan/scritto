import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Static, always-on guard for specs/kopieren-req.md Abschnitt 5, Grenzfall 15
 * (privacy): clipboard content must never be read/written via
 * `navigator.clipboard` anywhere in the app — copy/cut/paste run exclusively
 * through the browser's native, non-scriptable clipboard mechanism (see
 * specs/kopieren-code.md Architekturentscheidung 1). This backs the manual
 * code-review point with an automated, permanent check instead of relying on
 * review discipline alone.
 *
 * Scope, stated honestly: this scan proves only the `navigator.clipboard`
 * NON-usage. The broader privacy promise of Grenzfall 15 (no logging, no
 * telemetry, no `localStorage`/`IndexedDB` mirroring of clipboard content)
 * rests on the fact that the app has NO capture path at all — copy runs
 * entirely through the browser's non-scriptable native handler, so there is
 * nothing to log — backed by the manual code-review point on every PR touching
 * clipboard.ts, NOT on this string scan. If a capture path were ever added,
 * this test would not catch it; the review discipline is what must.
 *
 * This file itself is excluded from the scan: it necessarily names the
 * forbidden API in a string literal to test for it, which is not a violation.
 * Comments are stripped before matching so that *documentation* referencing
 * the API (e.g. clipboard.ts's own explanatory comment) doesn't count as
 * *usage* of it.
 *
 * No other exceptions are currently needed (0 legitimate hits) — if a future,
 * deliberate use is ever added, extend `ALLOWED` with a file-relative path and
 * a comment explaining why, rather than weakening the check below.
 */
const ALLOWED = new Set<string>(['formats/shared/editor/__tests__/clipboard-privacy.test.ts'])

const SRC_DIR = join(__dirname, '../../../../')

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((entry): entry is string => typeof entry === 'string' && /\.(ts|tsx)$/.test(entry))
    .map((entry) => join(dir, entry))
}

/** Strips line and block comments so documentation mentioning the API isn't mistaken for real usage. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('clipboard privacy (specs/kopieren-req.md Abschnitt 5, Grenzfall 15)', () => {
  it('never accesses navigator.clipboard anywhere in src/', () => {
    const hits: string[] = []
    for (const file of collectSourceFiles(SRC_DIR)) {
      const relPath = relative(SRC_DIR, file).replace(/\\/g, '/')
      if (ALLOWED.has(relPath)) continue
      const content = stripComments(readFileSync(file, 'utf-8'))
      if (content.includes('navigator.clipboard')) hits.push(relPath)
    }
    expect(hits).toEqual([])
  })
})
