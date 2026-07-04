import { test, expect } from '@playwright/test'

/**
 * Real-browser proof for Anforderung 2.2 (speichern-exportieren-req.md), first bullet:
 * exporting must never contact a server — the whole pipeline is Blob → Object-URL →
 * `<a download>`. `page.on('request', ...)` is registered before the export click purely
 * to *observe* network traffic (permitted per speichern-exportieren-qa.md §2, which only
 * forbids using `page.evaluate()` to replace real clicks/typing, not to observe requests).
 */
test.describe('Export network isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
  })

  for (const cardHeading of ['Word-Dokument (.docx)', 'OpenDocument Text (.odt)']) {
    test(`exporting a ${cardHeading} document makes no network request carrying the document content`, async ({
      page,
      baseURL,
    }) => {
      const requests: { url: string; method: string; postData: string | null }[] = []
      page.on('request', (req) => {
        requests.push({ url: req.url(), method: req.method(), postData: req.postData() })
      })

      await page
        .locator('div.rounded-lg', { has: page.getByRole('heading', { name: cardHeading } as const) })
        .getByRole('button', { name: 'Neu erstellen' })
        .click()

      const editor = page.locator('.ProseMirror')
      await expect(editor).toBeVisible()
      await editor.click()
      const secretMarker = 'GEHEIMER-DOKUMENTINHALT-DARF-NIE-ÜBERS-NETZ-GEHEN'
      await page.keyboard.type(secretMarker)

      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Exportieren' }).click()
      await downloadPromise

      // No request left the app's own origin.
      const externalRequests = requests.filter((r) => baseURL && !r.url.startsWith(baseURL))
      expect(externalRequests, `unexpected external requests: ${JSON.stringify(externalRequests)}`).toEqual([])

      // No request anywhere (own origin or not) carried the document content, and no
      // non-GET request was made at all during the whole interaction.
      const nonGetRequests = requests.filter((r) => r.method !== 'GET')
      expect(nonGetRequests, `unexpected non-GET requests: ${JSON.stringify(nonGetRequests)}`).toEqual([])

      const leaking = requests.filter((r) => r.postData?.includes(secretMarker) || r.url.includes(secretMarker))
      expect(leaking, `document content must never appear in a network request: ${JSON.stringify(leaking)}`).toEqual(
        [],
      )
    })
  }
})
