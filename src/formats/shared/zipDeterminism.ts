import type JSZip from 'jszip'

/**
 * Fixed, arbitrary timestamp used to stamp every entry of a generated ZIP package.
 *
 * JSZip defaults every entry's ZIP-internal last-modified timestamp to `new Date()` at
 * the moment `.file()`/`.folder()` is called, whenever no explicit `date` option is
 * passed (`node_modules/jszip/lib/object.js`: `o.date = o.date || new Date()`). Neither
 * `writeDocx` nor `writeOdt` ever pass one, so two exports of the very same, unchanged
 * document produce byte-different `.docx`/`.odt` files whenever the two writer calls
 * straddle the 2-second DOS-timestamp resolution boundary — violating the "two
 * consecutive exports are byte/content-identical" requirement (speichern-exportieren-req.md
 * §2.4/§3.5, Testfall 11).
 *
 * 1980-01-01 is used because it is the earliest date representable in the DOS date
 * format the ZIP local file header uses (`generate/ZipFileWorker.js` computes
 * `date.getUTCFullYear() - 1980`); any earlier date would silently wrap. The exact value
 * is otherwise arbitrary — it only needs to be constant across calls, not meaningful.
 */
export const DETERMINISTIC_ZIP_ENTRY_DATE = new Date(Date.UTC(1980, 0, 1))

/**
 * Overwrites the last-modified date of every entry already added to `zip` (including the
 * implicit directory entries created by `.folder()`) with a fixed constant, so the
 * generated archive's bytes depend only on document content, never on wall-clock time.
 *
 * Must be called after all `.file()`/`.folder()` calls have been made and right before
 * `zip.generateAsync(...)`.
 */
export function stampZipEntriesForDeterminism(zip: JSZip): void {
  zip.forEach((_relativePath, entry) => {
    entry.date = DETERMINISTIC_ZIP_ENTRY_DATE
  })
}
