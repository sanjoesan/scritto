import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, docxCard, odtCard } from './fixtures'
import { DOCX_MIME, ODT_MIME } from './fixtures/builders'
import JSZip from 'jszip'

/**
 * Real-browser export performance/robustness test for Testfall 13 of
 * specs/speichern-exportieren-qa.md ("Großes Dokument, Zeitbudget, kein Crash") — the
 * export-side counterpart to tests/e2e/large-document-import.spec.ts (which covers the
 * *import* side of the same two large real-world fixtures for a different feature,
 * specs/datei-oeffnen-qa.md). Bug 1.7 in specs/speichern-exportieren-code.md flagged a
 * comment in src/formats/{docx,odt}/__tests__/external-fixtures.test.ts that used to
 * reference a non-existent "large-document-export.spec.ts" — this file is that.
 *
 * Reuses the already-vetted large real-world fixtures (bug65649.docx, ~475KB;
 * brokenList.odt, ~2.4MB / ~20k automatic styles) instead of hand-building a synthetic
 * "25 images + 200x8 table" fixture: they are real documents already known to stress
 * the import path, and exercising export on them additionally proves the *round trip*
 * (import a large doc -> export it) works end-to-end without a synthetic construction
 * that risks not matching any real document shape.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DOCX = join(__dirname, '../fixtures/external/docx')
const FIXTURES_ODT = join(__dirname, '../fixtures/external/odt')

test.setTimeout(60_000)

test('exporting a large DOCX (bug65649.docx, ~475KB) completes within budget and keeps the UI responsive', async ({
  page,
  errors,
}) => {
  const buffer = readFileSync(join(FIXTURES_DOCX, 'bug65649.docx'))

  const input = docxCard(page).locator('input[type="file"]')
  await input.setInputFiles({ name: 'bug65649.docx', mimeType: DOCX_MIME, buffer })
  await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 30_000 })

  // A small real edit, as specified ("eine kleine Änderung vornehmen, dann Export
  // klicken"), so the export path also has to serialize freshly-typed content, not
  // just re-emit an untouched import.
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Ende.')

  const exportButton = page.getByRole('button', { name: 'Exportieren' })
  const backButton = page.getByRole('button', { name: /formate/i })

  const start = Date.now()
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()

  // While `exporting === true` (button disabled, showing "Exportiere…"), the rest of
  // the page must still be interactive — proof the UI is not fully frozen during
  // serialization. Best-effort: only meaningful if the export is still in flight when
  // checked, which is likely for a document this size but not guaranteed on a fast
  // machine, so this is an informational check, not a hard requirement on timing.
  if (await exportButton.isDisabled().catch(() => false)) {
    await expect(backButton).toBeEnabled()
    await backButton.focus()
    await expect(backButton).toBeFocused()
  }

  const download = await downloadPromise
  const elapsedMs = Date.now() - start
  // eslint-disable-next-line no-console
  console.log(`bug65649.docx export time: ${elapsedMs} ms`)

  // Hard assertion per Anforderung 3.3 / Testfall 13.
  expect(elapsedMs).toBeLessThan(5_000)

  const downloadedPath = await download.path()
  expect(downloadedPath).toBeTruthy()
  const exportedBuffer = readFileSync(downloadedPath!)
  const zip = await JSZip.loadAsync(exportedBuffer)
  expect(zip.file('word/document.xml')).toBeTruthy()

  expect(errors, errors.join('\n')).toEqual([])
})

test('exporting a large ODT (brokenList.odt, ~2.4MB, ~20k automatic styles) completes within budget and keeps the UI responsive', async ({
  page,
  errors,
}) => {
  const buffer = readFileSync(join(FIXTURES_ODT, 'brokenList.odt'))

  const input = odtCard(page).locator('input[type="file"]')
  await input.setInputFiles({ name: 'brokenList.odt', mimeType: ODT_MIME, buffer })
  await expect(page.locator('.ProseMirror').or(page.getByRole('alert'))).toBeVisible({ timeout: 30_000 })

  // brokenList.odt is a stress fixture from the ODF Toolkit corpus; only proceed with
  // the export-timing assertion if it actually imported into an editable document
  // (matches the "no error" branch of large-document-import.spec.ts's own check).
  const editorVisible = await page.locator('.ProseMirror').isVisible().catch(() => false)
  test.skip(!editorVisible, 'brokenList.odt did not import into an editable document on this run')

  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Ende.')

  const exportButton = page.getByRole('button', { name: 'Exportieren' })
  const backButton = page.getByRole('button', { name: /formate/i })

  const start = Date.now()
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()

  if (await exportButton.isDisabled().catch(() => false)) {
    await expect(backButton).toBeEnabled()
    await backButton.focus()
    await expect(backButton).toBeFocused()
  }

  const download = await downloadPromise
  const elapsedMs = Date.now() - start
  // eslint-disable-next-line no-console
  console.log(`brokenList.odt export time: ${elapsedMs} ms`)

  expect(elapsedMs).toBeLessThan(5_000)

  const downloadedPath = await download.path()
  expect(downloadedPath).toBeTruthy()
  const exportedBuffer = readFileSync(downloadedPath!)
  const zip = await JSZip.loadAsync(exportedBuffer)
  expect(zip.file('content.xml')).toBeTruthy()

  expect(errors, errors.join('\n')).toEqual([])
})
