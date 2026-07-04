import { test, expect } from '@playwright/test'
import JSZip from 'jszip'
import {
  buildFullCoverageDocx,
  FULL_COVERAGE_DOCX_FILENAME,
  FULL_COVERAGE_HEADING_TEXT,
  FULL_COVERAGE_BULLET_ITEMS,
  FULL_COVERAGE_ORDERED_ITEMS,
  FULL_COVERAGE_MERGED_CELL_TEXT,
  FULL_COVERAGE_UMLAUT_TEXT,
} from './fixtures/fullCoverageDocument'

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

/** A minimal, hand-built DOCX — independent of this app's own writer — used to test import. */
async function buildSampleDocx(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `</Types>`,
  )
  zip
    .folder('_rels')!
    .file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`,
    )
  zip
    .folder('docProps')!
    .file(
      'core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Beispieldokument</dc:title></cp:coreProperties>`,
    )
  zip
    .folder('word')!
    .file(
      'document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document ${W_NS}><w:body>` +
        `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Willkommen</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t xml:space="preserve">Dies ist ein </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Testdokument</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>` +
        `<w:sectPr/>` +
        `</w:body></w:document>`,
    )
  return zip.generateAsync({ type: 'nodebuffer' })
}

function docxCard(page: import('@playwright/test').Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}

test.describe('DOCX editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
  })

  test('creates a new document, types and bolds text, and exports it', async ({ page }) => {
    await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()

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
    const documentXml = await zip.file('word/document.xml')!.async('text')

    expect(documentXml).toContain('Hallo Welt')
    expect(documentXml).toContain('<w:b/>')
  })

  test('uploads an existing DOCX file and shows its content', async ({ page }) => {
    const buffer = await buildSampleDocx()
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({
      name: 'beispiel.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
    })

    const editor = page.locator('.ProseMirror')
    await expect(editor).toContainText('Willkommen')
    await expect(editor).toContainText('Testdokument')
  })

  test('round trip: uploading then exporting unchanged preserves heading, text, and bold formatting', async ({
    page,
  }) => {
    const buffer = await buildSampleDocx()
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({
      name: 'beispiel.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
    })
    await expect(page.locator('.ProseMirror')).toContainText('Willkommen')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const downloadedPath = await download.path()
    expect(downloadedPath).toBeTruthy()

    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile(downloadedPath!)
    const zip = await JSZip.loadAsync(exportedBuffer)
    const documentXml = await zip.file('word/document.xml')!.async('text')

    expect(documentXml).toContain('Willkommen')
    expect(documentXml).toContain('Testdokument')
    expect(documentXml).toContain('<w:b/>')
  })

  test('editing an uploaded document and exporting reflects the edit', async ({ page }) => {
    const buffer = await buildSampleDocx()
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({
      name: 'beispiel.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
    })

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
    const documentXml = await zip.file('word/document.xml')!.async('text')

    expect(documentXml).toContain('Zusatz')
  })

  test('round trip: a merged (colspan) table cell survives real upload → real export → real re-upload (Bug 1.4/1.5/1.6)', async ({
    page,
  }) => {
    // Independent hand-built fixture: a 2-column table whose first row is a single
    // gridSpan=2 cell ("Merged Header") and whose second row has two plain cells.
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
          `<w:document ${W_NS}><w:body>` +
          `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>` +
          `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>Merged Header</w:t></w:r></w:p></w:tc></w:tr>` +
          `<w:tr><w:tc><w:p><w:r><w:t>A2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B2</w:t></w:r></w:p></w:tc></w:tr>` +
          `</w:tbl>` +
          `<w:p/><w:sectPr/></w:body></w:document>`,
      )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({
      name: 'tabelle.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
    })
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
    // (not just the writer's unit-tested output in isolation).
    const { readZipEntryCompressionMethods, ZIP_COMPRESSION_DEFLATE } = await import(
      '../../src/formats/shared/__tests__/zipInspect'
    )
    const methods = readZipEntryCompressionMethods(exportedBuffer)
    expect(methods.get('word/document.xml')).toBe(ZIP_COMPRESSION_DEFLATE)

    const exportedZip = await JSZip.loadAsync(exportedBuffer)
    const documentXml = await exportedZip.file('word/document.xml')!.async('text')
    expect(documentXml).toContain('Merged Header')
    expect(documentXml).toContain('<w:gridSpan w:val="2"/>')
    // Bug 1.4: exactly 2 <w:gridCol/> (colspan-sum), not "as many gridCol as cell nodes
    // in the first row" (which would under-declare to 1 for a single spanned cell).
    expect((documentXml.match(/<w:gridCol\b/g) ?? []).length).toBe(2)

    // Real second upload of the exact downloaded bytes — full fidelity round trip.
    // Navigate back to the picker first: the file input only exists on that screen,
    // not inside the open DocumentWorkspace editor.
    await page.getByRole('button', { name: /formate/i }).click()
    const reimportInput = docxCard(page).locator('input[type="file"]')
    await reimportInput.setInputFiles({
      name: 'tabelle-reimport.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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

    const originalBuffer = await buildFullCoverageDocx()
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({
      name: FULL_COVERAGE_DOCX_FILENAME,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
    expect(download.suggestedFilename()).toBe(FULL_COVERAGE_DOCX_FILENAME)

    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile(downloadedPath!)
    const exportedZip = await JSZip.loadAsync(exportedBuffer)
    expect(exportedZip.file('[Content_Types].xml')).toBeTruthy()
    expect(exportedZip.file('word/document.xml')).toBeTruthy()
    expect(exportedZip.file('word/styles.xml')).toBeTruthy()

    // Re-import the exact downloaded bytes through a second, independent real upload —
    // not the in-memory object from step one.
    await page.getByRole('button', { name: /formate/i }).click()
    const reimportInput = docxCard(page).locator('input[type="file"]')
    await reimportInput.setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: exportedBuffer,
    })
    await expect(editor).toBeVisible()

    await assertFullCoverage()

    expect(pageErrors, pageErrors.join('\n')).toEqual([])
  })
})
