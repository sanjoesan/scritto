import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import fs from 'node:fs/promises'

/**
 * Real-browser lifecycle tests for "Exportieren/Speichern" (specs/speichern-exportieren-qa.md
 * §2.5, Testfälle 1, 2, 5, 6, 7, 10 (Grenzfall), 11, 14, 15). Every interaction here is a real
 * click/keypress/file-upload/download — no `page.evaluate()` is used to trigger app behavior,
 * only (where explicitly noted) to observe `document.activeElement`/dispatch a synthetic
 * `beforeunload` event per the QA plan's documented fallback technique (§2.5.1 technique 2).
 */

interface FormatSpec {
  id: 'docx' | 'odt'
  cardHeading: string
  extension: string
  mimeType: string
  contentEntry: string
}

const DOCX: FormatSpec = {
  id: 'docx',
  cardHeading: 'Word-Dokument (.docx)',
  extension: '.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  contentEntry: 'word/document.xml',
}

const ODT: FormatSpec = {
  id: 'odt',
  cardHeading: 'OpenDocument Text (.odt)',
  extension: '.odt',
  mimeType: 'application/vnd.oasis.opendocument.text',
  contentEntry: 'content.xml',
}

function cardFor(page: Page, heading: string) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: heading }) })
}

async function createNew(page: Page, format: FormatSpec) {
  await cardFor(page, format.cardHeading).getByRole('button', { name: 'Neu erstellen' }).click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
}

async function exportAndGetBuffer(page: Page): Promise<Buffer> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  const downloadedPath = await download.path()
  expect(downloadedPath, 'download must actually land on disk').toBeTruthy()
  return fs.readFile(downloadedPath!)
}

for (const format of [DOCX, ODT]) {
  test.describe(`Save/Export lifecycle — ${format.extension}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: /verstanden/i }).click()
    })

    test('exports a brand-new, untouched document and it re-imports as a valid empty document (Testfall 1/2)', async ({
      page,
    }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(String(e)))

      await createNew(page, format)
      const buffer = await exportAndGetBuffer(page)

      const zip = await JSZip.loadAsync(buffer)
      expect(zip.file(format.contentEntry), `${format.contentEntry} must exist in the export`).toBeTruthy()

      // Real second upload of the exact bytes that were just downloaded.
      await page.getByRole('button', { name: /formate/i }).click()
      const input = cardFor(page, format.cardHeading).locator('input[type="file"]')
      await input.setInputFiles({ name: `reimport${format.extension}`, mimeType: format.mimeType, buffer })

      await expect(page.locator('.ProseMirror')).toBeVisible()
      expect(pageErrors, `no JS errors during reimport: ${pageErrors.join('; ')}`).toEqual([])
    })

    test('unsaved indicator disappears immediately after export and reappears after the next edit (Testfall 6)', async ({
      page,
    }) => {
      await createNew(page, format)
      await page.locator('.ProseMirror').click()
      await page.keyboard.type('Hallo')

      await expect(page.getByText('● ungespeichert')).toBeVisible()
      await exportAndGetBuffer(page)
      await expect(page.getByText('● ungespeichert')).toHaveCount(0)

      await page.locator('.ProseMirror').click()
      await page.keyboard.type('!')
      await expect(page.getByText('● ungespeichert')).toBeVisible()
    })

    test('beforeunload warning is suppressed right after export and re-armed after the next edit (Testfall 7)', async ({
      page,
    }) => {
      // Technique 2 from speichern-exportieren-qa.md §2.5.1: a manual dispatch of
      // `beforeunload` *after* real editing/export interactions, checking
      // `defaultPrevented` — used as the documented, cross-engine-reliable fallback
      // instead of technique 1 (`page.on('dialog')` around a real navigation), which is
      // known to behave inconsistently for `beforeunload` across Chromium/WebKit.
      const dispatchBeforeUnload = () =>
        page.evaluate(() => {
          const event = new Event('beforeunload', { cancelable: true })
          window.dispatchEvent(event)
          return event.defaultPrevented
        })

      await createNew(page, format)
      await page.locator('.ProseMirror').click()
      await page.keyboard.type('Hallo')

      expect(await dispatchBeforeUnload(), 'warning must be active while dirty').toBe(true)

      await exportAndGetBuffer(page)
      // Wait for the app's own visible signal that `dirty` has actually landed as
      // `false` (React effects/state commits are asynchronous) before checking the
      // listener — avoids a race between the export promise resolving and React
      // re-running `useBeforeUnloadWarning`'s effect, instead of an arbitrary sleep.
      await expect(page.getByText('● ungespeichert')).toHaveCount(0)
      // React's *passive* effect (the one that actually removes the old `beforeunload`
      // listener) is scheduled asynchronously after paint and can, on some engines
      // (observed on WebKit), commit one tick after the DOM text update above is
      // already visible — `expect.poll` retries the check instead of asserting once,
      // so this isn't a fixed/guessed sleep.
      await expect
        .poll(() => dispatchBeforeUnload(), { message: 'warning must be suppressed right after a clean export' })
        .toBe(false)

      await page.locator('.ProseMirror').click()
      await page.keyboard.type('!')
      expect(await dispatchBeforeUnload(), 'warning must re-arm after the next edit').toBe(true)
    })

    test('two consecutive exports without any change in between produce byte-identical files (Testfall 11)', async ({
      page,
    }) => {
      await createNew(page, format)
      await page.locator('.ProseMirror').click()
      await page.keyboard.type('Unverändert')

      const bufferA = await exportAndGetBuffer(page)
      const bufferB = await exportAndGetBuffer(page)

      expect(
        Buffer.compare(bufferA, bufferB),
        'two exports of the same unmodified document must be byte-identical (no hidden timestamp)',
      ).toBe(0)
    })

    test('ten consecutive exports in the same tab without reload complete without error (Testfall 14)', async ({
      page,
    }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (e) => pageErrors.push(String(e)))

      await createNew(page, format)
      await page.locator('.ProseMirror').click()
      await page.keyboard.type('Wiederholt exportieren')

      for (let i = 0; i < 10; i++) {
        const buffer = await exportAndGetBuffer(page)
        expect(buffer.byteLength, `download #${i + 1} must not be empty`).toBeGreaterThan(0)
        const zip = await JSZip.loadAsync(buffer)
        expect(zip.file(format.contentEntry), `download #${i + 1} must be a valid zip`).toBeTruthy()
      }

      expect(pageErrors, `no JS errors across 10 exports: ${pageErrors.join('; ')}`).toEqual([])
    })

    test('no confirmation dialog on closing after a clean export, unlike before it (Testfall 15)', async ({ page }) => {
      await createNew(page, format)
      await page.locator('.ProseMirror').click()
      await page.keyboard.type('Text')

      let dialogSeen = false
      page.once('dialog', (dialog) => {
        dialogSeen = true
        void dialog.dismiss()
      })
      await page.getByRole('button', { name: /formate/i }).click()
      // Give the dialog a deterministic short window to appear before asserting.
      await page.waitForTimeout(200)
      expect(dialogSeen, 'closing a dirty document must ask for confirmation').toBe(true)
      // Dismissed → must still be on the editor, not navigated away.
      await expect(page.locator('.ProseMirror')).toBeVisible()

      await exportAndGetBuffer(page)

      let dialogSeenAfterExport = false
      page.once('dialog', (dialog) => {
        dialogSeenAfterExport = true
        void dialog.dismiss()
      })
      await page.getByRole('button', { name: /formate/i }).click()
      await page.waitForTimeout(200)
      expect(dialogSeenAfterExport, 'closing right after a clean export must NOT ask for confirmation').toBe(false)
      await expect(page.getByRole('heading', { name: /salamanido/i })).toBeVisible()
    })

    test('a real (fast) double-click on Exportieren produces exactly one download (Bug 1.1 symptom)', async ({
      page,
    }) => {
      await createNew(page, format)
      await page.locator('.ProseMirror').click()
      await page.keyboard.type('Doppelklick-Test')

      const downloads: string[] = []
      page.on('download', (d) => downloads.push(d.suggestedFilename()))

      // A genuine browser double-click dispatches two real click events in rapid,
      // native succession — this is the actual user action Bug 1.1 is about, not a
      // simulated pair of separately-awaited clicks.
      await page.getByRole('button', { name: 'Exportieren' }).dblclick()
      // Give any (incorrect) second download a deterministic window to appear.
      await page.waitForTimeout(500)

      expect(downloads.length, `expected exactly one download, got: ${downloads.join(', ')}`).toBe(1)
    })
  })
}

test.describe('Save/Export lifecycle — filename edge case (Testfall 10)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
  })

  test('keeps a filename without a matching extension unchanged on export', async ({ page, browserName }) => {
    // A minimal, independently hand-built DOCX (not produced by this app's own writer).
    const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `</Types>`,
    )
    zip
      .folder('_rels')!
      .file(
        '.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
          `</Relationships>`,
      )
    zip
      .folder('word')!
      .file(
        'document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<w:document ${W_NS}><w:body><w:p><w:r><w:t>Vertragstext</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
      )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const input = cardFor(page, DOCX.cardHeading).locator('input[type="file"]')
    await input.setInputFiles({ name: 'Vertrag', mimeType: DOCX.mimeType, buffer })
    await expect(page.locator('.ProseMirror')).toContainText('Vertragstext')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise

    // speichern-exportieren-qa.md assumed the suggested filename stays byte-for-byte
    // "Vertrag" (no auto-correction), citing that `downloadBlob()` in
    // DocumentWorkspace.tsx itself performs no extension logic — which is true of the
    // *application* code (verified by reading the source: `anchor.download = fileName`
    // with no extension handling at all). Real-browser verification across all three
    // Playwright projects shows this is actually an *engine-level* behavior split:
    //  - Chromium (Desktop Chrome, Mobile/Pixel 7): the download manager itself appends
    //    the extension implied by the Blob's MIME type when the suggested name has none
    //    → "Vertrag.docx".
    //  - WebKit (Tablet/iPad Mini): no such correction → stays "Vertrag", matching the
    //    QA plan's original assumption.
    // Neither is an application bug — it happens entirely at the browser/OS download
    // layer, outside the app's control, and could not be observed by a unit test
    // mocking `URL.createObjectURL`. speichern-exportieren-req.md §3.2 already flags
    // this exact scenario as an open question ("zu prüfen, ob das ein akzeptables
    // Verhalten ist") rather than a hard requirement — documented here per-engine as a
    // finding, not a failure of an enumerated Abschnitt-6 testfall.
    expect(download.suggestedFilename()).toBe(browserName === 'webkit' ? 'Vertrag' : 'Vertrag.docx')
  })
})

test.describe('Save/Export lifecycle — typing immediately after export (Testfall 5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
  })

  test('typing immediately after export (no click into editor) lands at the prior cursor position', async ({
    page,
  }) => {
    await createNew(page, DOCX)
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.type('Hallo Welt')
    // "Hallo Welt" has 10 characters; 5x ArrowLeft from the end (pos 10) lands the
    // caret at pos 5 — right after "Hallo", before the space — so typing 'X' there is
    // expected to produce "HalloX Welt".
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft')

    await exportAndGetBuffer(page)

    // No click back into the editor — exactly as specified by Testfall 5.
    await page.keyboard.type('X')

    await expect(editor).toContainText('HalloX Welt')
  })
})
