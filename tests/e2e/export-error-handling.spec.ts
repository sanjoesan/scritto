import { test, expect } from '@playwright/test'

/**
 * Real-browser coverage for Testfall 12 (specs/speichern-exportieren-req.md Abschnitt 6/7):
 * "Erzwungener Serialisierungsfehler -> sichtbare Fehlermeldung, Button kehrt zurück,
 * dirty bleibt true". A prior PO review correctly rejected treating this as satisfied by
 * (a) an empirical proof that no UI-only trigger exists, plus (b) a component/jsdom-level
 * unit test alone -- Abschnitt 7 literally requires this via *real browser interaction*
 * for every Testfall, not a unit-test-equivalent substitute, and that downgrade was never
 * escalated to/accepted by the PO in writing.
 *
 * Fix: a minimal, build-flag-gated test-only hook,
 * `window.__testHooks__.forceNextExportError(message?)` (src/app/DocumentWorkspace.tsx),
 * present only when the app is built with `VITE_ENABLE_TEST_HOOKS=true` (set exclusively
 * by playwright.config.ts's `webServer.env` -- never in a plain production build). It
 * arms a one-shot flag that makes the *next* real click on "Exportieren" fail, driving
 * the actual `handleExport` try/catch/finally end-to-end through the real button, exactly
 * as Abschnitt 7 requires. The first test below still empirically confirms (as before)
 * that revoking an image's Object-URL cannot be a real UI-only trigger in this codebase
 * (images are embedded via `FileReader.readAsDataURL`, never `createObjectURL`) --
 * documented for context, not as a substitute for the second, now-real forced-failure test.
 */

test.describe('Export error handling (Testfall 12)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
  })

  const TINY_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

  test('inserting an image never creates an Object-URL, so revoking one cannot be the real-browser trigger for Testfall 12', async ({
    page,
  }) => {
    await page
      .locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
      .getByRole('button', { name: 'Neu erstellen' })
      .click()
    await expect(page.locator('.ProseMirror')).toBeVisible()

    // Instrument URL.createObjectURL for the rest of the page's lifetime, *before* the
    // real image upload happens, purely to observe -- not to replace -- the upload.
    await page.evaluate(() => {
      ;(window as unknown as { __createdObjectUrls: string[] }).__createdObjectUrls = []
      const original = URL.createObjectURL.bind(URL)
      URL.createObjectURL = (obj: Blob | MediaSource) => {
        const url = original(obj)
        ;(window as unknown as { __createdObjectUrls: string[] }).__createdObjectUrls.push(url)
        return url
      }
    })

    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Text vor dem Bild.')

    // Real file upload through the actual, visible "🖼 Bild" control (a hidden
    // <input type="file"> behind a label, per Toolbar.tsx) -- not a simulated insert.
    const fileInput = page.locator('input[type="file"][accept="image/*"]')
    await fileInput.setInputFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    })
    await expect(page.locator('.ProseMirror img')).toBeVisible()

    const createdDuringImageInsert = await page.evaluate(
      () => (window as unknown as { __createdObjectUrls: string[] }).__createdObjectUrls,
    )
    expect(
      createdDuringImageInsert,
      'image insertion embeds a data: URL (FileReader.readAsDataURL) and creates no Object-URL at all -- ' +
        'confirming there is no Blob reference to revoke before export, so the QA plan\'s proposed ' +
        'browser-level trigger for Testfall 12 (§2.7, part 1) does not apply to this codebase as built',
    ).toEqual([])

    // Positive control, still real-browser and still meaningful: exporting a document
    // that actually contains an image must keep working (no regression), since that is
    // the exact precondition part 1 of the QA plan's technique depends on.
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    expect(await download.path()).toBeTruthy()
    await expect(page.getByText(/^Fehler|fehlgeschlagen/i)).toHaveCount(0)
  })

  test('a spurious error is never shown during a normal, uneventful export', async ({ page }) => {
    // Complementary fact to the forced-failure test below: the error UI slot
    // (`exportError`, rendered next to the Exportieren button) must stay absent when
    // nothing actually goes wrong.
    await page
      .locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
      .getByRole('button', { name: 'Neu erstellen' })
      .click()
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Normaler Export ohne Fehler.')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    await downloadPromise

    await expect(page.getByRole('button', { name: 'Exportieren' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Exportieren' })).toHaveText('Exportieren')
    await expect(page.getByText(/^Fehler|fehlgeschlagen/i)).toHaveCount(0)
  })

  test('forced serialization failure via a real click shows a visible error, recovers the button, and keeps dirty true (Testfall 12)', async ({
    page,
  }) => {
    await page
      .locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
      .getByRole('button', { name: 'Neu erstellen' })
      .click()
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Text vor dem erzwungenen Fehler.')
    await expect(page.getByText('● ungespeichert')).toBeVisible()

    // Arm the one-shot, build-flag-gated test hook -- present only because this
    // Playwright run's build sets VITE_ENABLE_TEST_HOOKS=true (playwright.config.ts).
    // This does not replace the click below; it only makes the *next* real
    // handleExport() call fail, the same way a genuine writer bug would.
    await page.evaluate(() => {
      window.__testHooks__?.forceNextExportError('Erzwungener Test-Serialisierungsfehler')
    })

    // A real click on the real button, driving the real try/catch/finally.
    await page.getByRole('button', { name: 'Exportieren' }).click()

    await expect(page.getByText('Erzwungener Test-Serialisierungsfehler')).toBeVisible()
    // Button recovers to a usable state (finally block ran) instead of getting stuck on
    // "Exportiere…"/disabled.
    await expect(page.getByRole('button', { name: 'Exportieren' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Exportieren' })).toHaveText('Exportieren')
    // dirty must NOT have been falsely cleared by the failed export.
    await expect(page.getByText('● ungespeichert')).toBeVisible()

    // Retry without reload must work (hook is one-shot/disarmed after being consumed):
    // a subsequent export succeeds as a real download and clears dirty.
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    expect(await download.path()).toBeTruthy()
    await expect(page.getByText('Erzwungener Test-Serialisierungsfehler')).toHaveCount(0)
    await expect(page.getByText('● ungespeichert')).toHaveCount(0)
  })
})
