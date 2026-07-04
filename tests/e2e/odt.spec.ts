import { test, expect } from '@playwright/test'
import JSZip from 'jszip'
import {
  buildFullCoverageOdt,
  FULL_COVERAGE_ODT_FILENAME,
  FULL_COVERAGE_HEADING_TEXT,
  FULL_COVERAGE_BULLET_ITEMS,
  FULL_COVERAGE_ORDERED_ITEMS,
  FULL_COVERAGE_MERGED_CELL_TEXT,
  FULL_COVERAGE_UMLAUT_TEXT,
} from './fixtures/fullCoverageDocument'

const NS = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"`

/** A minimal, hand-built ODT — independent of this app's own writer — used to test import. */
async function buildSampleOdt(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.3">` +
      `<office:automatic-styles><style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles>` +
      `<office:body><office:text><text:h text:outline-level="1">Willkommen</text:h>` +
      `<text:p>Dies ist ein <text:span text:style-name="Bold">Testdokument</text:span>.</text:p></office:text></office:body></office:document-content>`,
  )
  zip.file(
    'styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.3"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>`,
  )
  zip.file(
    'meta.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS} xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>Beispieldokument</dc:title></office:meta></office:document-meta>`,
  )
  zip
    .folder('META-INF')!
    .file(
      'manifest.xml',
      `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/></manifest:manifest>`,
    )
  return zip.generateAsync({ type: 'nodebuffer' })
}

function odtCard(page: import('@playwright/test').Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}

test.describe('ODT editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
  })

  test('creates a new document, types and bolds text, and exports it', async ({ page }) => {
    await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()

    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.type('Hallo Welt')

    await page.keyboard.press('ControlOrMeta+a')
    await page.getByTitle('Fett').click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const downloadedPath = await download.path()
    expect(downloadedPath).toBeTruthy()

    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile(downloadedPath!)
    const zip = await JSZip.loadAsync(exportedBuffer)
    const contentXml = await zip.file('content.xml')!.async('text')

    expect(contentXml).toContain('Hallo Welt')
    expect(contentXml).toContain('font-weight="bold"')
  })

  test('uploads an existing ODT file and shows its content', async ({ page }) => {
    const buffer = await buildSampleOdt()
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'beispiel.odt', mimeType: 'application/vnd.oasis.opendocument.text', buffer })

    const editor = page.locator('.ProseMirror')
    await expect(editor).toContainText('Willkommen')
    await expect(editor).toContainText('Testdokument')
  })

  test('round trip: uploading then exporting unchanged preserves heading, text, and bold formatting', async ({
    page,
  }) => {
    const buffer = await buildSampleOdt()
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'beispiel.odt', mimeType: 'application/vnd.oasis.opendocument.text', buffer })
    await expect(page.locator('.ProseMirror')).toContainText('Willkommen')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const downloadedPath = await download.path()
    expect(downloadedPath).toBeTruthy()

    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile(downloadedPath!)
    const zip = await JSZip.loadAsync(exportedBuffer)
    const contentXml = await zip.file('content.xml')!.async('text')

    expect(contentXml).toContain('Willkommen')
    expect(contentXml).toContain('Testdokument')
    expect(contentXml).toContain('font-weight="bold"')
  })

  test('editing an uploaded document and exporting reflects the edit', async ({ page }) => {
    const buffer = await buildSampleOdt()
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'beispiel.odt', mimeType: 'application/vnd.oasis.opendocument.text', buffer })

    const editor = page.locator('.ProseMirror')
    await expect(editor).toContainText('Willkommen')

    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Zusatz')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const downloadedPath = await download.path()

    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile(downloadedPath!)
    const zip = await JSZip.loadAsync(exportedBuffer)
    const contentXml = await zip.file('content.xml')!.async('text')

    expect(contentXml).toContain('Zusatz')
  })

  test('round trip: a merged (colspan) table cell survives real upload → real export → real re-upload, with ODF-compliant covered-table-cell placeholders (Bug 1.4/1.5/1.6)', async ({
    page,
  }) => {
    // Independent hand-built fixture: a 2-column table whose first row is a single
    // horizontally-merged cell ("Merged Header") and whose second row has two plain cells.
    // Needs its own namespace list (adds xmlns:table) — the file-level `NS` constant
    // above doesn't declare the `table:` prefix since none of the other fixtures use it.
    const NS_WITH_TABLE = `${NS} xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"`
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
    zip.file(
      'content.xml',
      `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS_WITH_TABLE} office:version="1.3">` +
        `<office:body><office:text>` +
        `<table:table table:name="Table1">` +
        `<table:table-column/><table:table-column/>` +
        `<table:table-row><table:table-cell table:number-columns-spanned="2"><text:p>Merged Header</text:p></table:table-cell><table:covered-table-cell/></table:table-row>` +
        `<table:table-row><table:table-cell><text:p>A2</text:p></table:table-cell><table:table-cell><text:p>B2</text:p></table:table-cell></table:table-row>` +
        `</table:table>` +
        `</office:text></office:body></office:document-content>`,
    )
    zip.file(
      'styles.xml',
      `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.3"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>`,
    )
    zip.file(
      'meta.xml',
      `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS} xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>Tabelle</dc:title></office:meta></office:document-meta>`,
    )
    zip
      .folder('META-INF')!
      .file(
        'manifest.xml',
        `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/></manifest:manifest>`,
      )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'tabelle.odt', mimeType: 'application/vnd.oasis.opendocument.text', buffer })
    const editor = page.locator('.ProseMirror')
    await expect(editor).toContainText('Merged Header')
    await expect(editor).toContainText('A2')
    await expect(editor).toContainText('B2')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const downloadedPath = await download.path()
    expect(downloadedPath).toBeTruthy()

    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile(downloadedPath!)

    // Bug 1.6: the real, browser-downloaded package must actually be DEFLATE-compressed
    // for content.xml, while the mimetype entry stays Stored.
    const { readZipEntryCompressionMethods, ZIP_COMPRESSION_DEFLATE, ZIP_COMPRESSION_STORED } = await import(
      '../../src/formats/shared/__tests__/zipInspect'
    )
    const methods = readZipEntryCompressionMethods(exportedBuffer)
    expect(methods.get('content.xml')).toBe(ZIP_COMPRESSION_DEFLATE)
    expect(methods.get('mimetype')).toBe(ZIP_COMPRESSION_STORED)

    const exportedZip = await JSZip.loadAsync(exportedBuffer)
    const contentXml = await exportedZip.file('content.xml')!.async('text')
    expect(contentXml).toContain('Merged Header')

    // Bug 1.4/1.5: exactly 2 <table:table-column/>, and every row has exactly as many
    // table-cell/covered-table-cell elements as declared columns (ODF 1.3 §9.1.1) — the
    // real, browser-produced download, not just a direct writeOdt() unit-test call.
    expect((contentXml.match(/<table:table-column\/>/g) ?? []).length).toBe(2)
    const rowMatches = contentXml.match(/<table:table-row>.*?<\/table:table-row>/gs) ?? []
    expect(rowMatches).toHaveLength(2)
    for (const row of rowMatches) {
      const cellCount = (row.match(/<table:table-cell[ >]/g) ?? []).length
      const coveredCount = (row.match(/<table:covered-table-cell\/>/g) ?? []).length
      expect(cellCount + coveredCount).toBe(2)
    }

    // Real second upload of the exact downloaded bytes — full fidelity round trip.
    await page.getByRole('button', { name: /formate/i }).click()
    const reimportInput = odtCard(page).locator('input[type="file"]')
    await reimportInput.setInputFiles({
      name: 'tabelle-reimport.odt',
      mimeType: 'application/vnd.oasis.opendocument.text',
      buffer: exportedBuffer,
    })
    await expect(editor).toContainText('Merged Header')
    await expect(editor).toContainText('A2')
    await expect(editor).toContainText('B2')
  })

  test('round trip: full §5.2 minimum coverage — mixed formatting, heading, both list types, merged/formatted table cell, image, umlauts in text and filename', async ({
    page,
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))

    const originalBuffer = await buildFullCoverageOdt()
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({
      name: FULL_COVERAGE_ODT_FILENAME,
      mimeType: 'application/vnd.oasis.opendocument.text',
      buffer: originalBuffer,
    })

    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()

    async function assertFullCoverage() {
      // Heading
      await expect(page.locator('.ProseMirror h1', { hasText: FULL_COVERAGE_HEADING_TEXT })).toHaveCount(1)

      // Both list types, non-nested, each with its own items.
      await expect(page.locator('.ProseMirror ul')).toHaveCount(1)
      await expect(page.locator('.ProseMirror ol')).toHaveCount(1)
      for (const text of FULL_COVERAGE_BULLET_ITEMS) {
        await expect(page.locator('.ProseMirror ul li', { hasText: text })).toHaveCount(1)
      }
      for (const text of FULL_COVERAGE_ORDERED_ITEMS) {
        await expect(page.locator('.ProseMirror ol li', { hasText: text })).toHaveCount(1)
      }

      // Table with a cell that is both merged (colspan) AND formatted (bold).
      await expect(page.locator('.ProseMirror tr')).toHaveCount(2)
      await expect(page.locator('.ProseMirror td')).toHaveCount(3)
      const mergedCell = page.locator('.ProseMirror td[colspan="2"]')
      await expect(mergedCell).toHaveCount(1)
      await expect(mergedCell).toContainText(FULL_COVERAGE_MERGED_CELL_TEXT)
      await expect(mergedCell.locator('strong', { hasText: FULL_COVERAGE_MERGED_CELL_TEXT })).toHaveCount(1)
      await expect(editor).toContainText('Zelle A2')
      await expect(editor).toContainText('Zelle B2')

      // Image
      await expect(page.locator('.ProseMirror img')).toHaveCount(1)

      // Mixed character formatting: bold, italic, underline, strikethrough, font
      // color, highlight — each checked as its own mark, not just a text string.
      await expect(page.locator('.ProseMirror strong', { hasText: 'Fett' })).toHaveCount(1)
      await expect(page.locator('.ProseMirror em', { hasText: 'Kursiv' })).toHaveCount(1)
      await expect(page.locator('.ProseMirror u', { hasText: 'Unterstrichen' })).toHaveCount(1)
      await expect(page.locator('.ProseMirror s', { hasText: 'Durchgestrichen' })).toHaveCount(1)
      await expect(page.locator('.ProseMirror span[style*="color"]', { hasText: 'Farbig' })).toHaveCount(1)
      await expect(page.locator('.ProseMirror span[style*="background-color"]', { hasText: 'Hervorgehoben' })).toHaveCount(1)

      // Umlauts/special characters in the running text.
      await expect(editor).toContainText(FULL_COVERAGE_UMLAUT_TEXT)
    }

    await assertFullCoverage()

    // Export WITHOUT any change.
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const downloadedPath = await download.path()
    expect(downloadedPath).toBeTruthy()

    // Umlauts/special characters in the filename itself must survive unchanged.
    expect(download.suggestedFilename()).toBe(FULL_COVERAGE_ODT_FILENAME)

    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile(downloadedPath!)
    const exportedZip = await JSZip.loadAsync(exportedBuffer)
    expect(exportedZip.file('mimetype')).toBeTruthy()
    expect(exportedZip.file('content.xml')).toBeTruthy()
    expect(exportedZip.file('META-INF/manifest.xml')).toBeTruthy()
    const mimetypeContent = await exportedZip.file('mimetype')!.async('text')
    expect(mimetypeContent).toBe('application/vnd.oasis.opendocument.text')

    // ODF spec: the mimetype entry must be the first entry in the zip, uncompressed.
    // Scans the raw local file headers directly (not via JSZip, which is also what the
    // writer under test uses) — see zipInspect.ts.
    const { readZipEntryInfo, ZIP_COMPRESSION_STORED } = await import('../../src/formats/shared/__tests__/zipInspect')
    const rawEntries = readZipEntryInfo(exportedBuffer)
    const [firstEntryName] = rawEntries.keys()
    expect(firstEntryName).toBe('mimetype')
    expect(rawEntries.get('mimetype')?.compressionMethod).toBe(ZIP_COMPRESSION_STORED)

    // Re-import the exact downloaded bytes through a second, independent real upload —
    // not the in-memory object from step one.
    await page.getByRole('button', { name: /formate/i }).click()
    const reimportInput = odtCard(page).locator('input[type="file"]')
    await reimportInput.setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/vnd.oasis.opendocument.text',
      buffer: exportedBuffer,
    })
    await expect(editor).toBeVisible()

    await assertFullCoverage()

    expect(pageErrors, pageErrors.join('\n')).toEqual([])
  })
})
