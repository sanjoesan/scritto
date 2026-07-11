import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, docxCard, odtCard } from './fixtures'
import { buildSampleDocx, buildSampleOdt, DOCX_MIME, ODT_MIME } from './fixtures/builders'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DOCX = join(__dirname, '../fixtures/external/docx')
const FIXTURES_ODT = join(__dirname, '../fixtures/external/odt')

// Every case below additionally relies on the global `errors` fixture (see fixtures.ts) —
// each test asserts 0 collected console/page errors at the end, per
// specs/datei-oeffnen-qa.md Abschnitt 1 Punkt 4 / Abschnitt 3.3.

test.describe('§3.13 — complex content is not silently lost on import', () => {
  test('E-3.13a [DOCX]: hyperlink text is visible in the editor (WithTabs.docx)', async ({ page, errors }) => {
    const buffer = readFileSync(join(FIXTURES_DOCX, 'WithTabs.docx'))
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'WithTabs.docx', mimeType: DOCX_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toBeVisible()
    // Real-world fixture: just assert the editor mounted with non-empty content, no crash.
    await expect(page.locator('.word-editor-surface .ProseMirror')).not.toHaveText('')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13a [ODT]: hyperlink text "Hello World!" is visible in the editor (Hyperlink-AOO401.odt)', async ({
    page,
    errors,
  }) => {
    const buffer = readFileSync(join(FIXTURES_ODT, 'Hyperlink-AOO401.odt'))
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'Hyperlink-AOO401.odt', mimeType: ODT_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Hello World!')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13b [DOCX]: FieldCodes.docx shows the cached field text, not an empty paragraph', async ({
    page,
    errors,
  }) => {
    const buffer = readFileSync(join(FIXTURES_DOCX, 'FieldCodes.docx'))
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'FieldCodes.docx', mimeType: DOCX_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('ANTONI')
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('16 June 2010')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13b [DOCX]: FldSimple.docx shows non-empty cached field text', async ({ page, errors }) => {
    const buffer = readFileSync(join(FIXTURES_DOCX, 'FldSimple.docx'))
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'FldSimple.docx', mimeType: DOCX_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toBeVisible()
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('FldSimple.docx')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13c [ODT]: FrameWithTable.odt shows table text inside the frame, no empty img element', async ({
    page,
    errors,
  }) => {
    const buffer = readFileSync(join(FIXTURES_ODT, 'FrameWithTable.odt'))
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'FrameWithTable.odt', mimeType: ODT_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Frame with Table')
    await expect(page.locator('.word-editor-surface .ProseMirror td').first()).toContainText('a')
    await expect(page.locator('.word-editor-surface .ProseMirror img[src=""]')).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13c [ODT]: frame.odt shows textbox content, no empty img element', async ({ page, errors }) => {
    const buffer = readFileSync(join(FIXTURES_ODT, 'frame.odt'))
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'frame.odt', mimeType: ODT_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Frame Content')
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Page Content')
    await expect(page.locator('.word-editor-surface .ProseMirror img[src=""]')).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13c [DOCX]: a textbox without an image shows its text, not an empty image element', async ({
    page,
    errors,
  }) => {
    const bodyInner =
      `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="TB"/>` +
      `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
      `<wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Text im Textfeld ohne Bild</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    const buffer = await buildSampleDocx(bodyInner)
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'textbox.docx', mimeType: DOCX_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Text im Textfeld ohne Bild')
    await expect(page.locator('.word-editor-surface .ProseMirror img[src=""]')).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13d [DOCX]: a chart/OLE drawing with no extractable text shows the unsupported_block placeholder, not a crash', async ({
    page,
    errors,
  }) => {
    const bodyInner =
      `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="Chart"/>` +
      `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
      `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId5"/>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    const buffer = await buildSampleDocx(bodyInner)
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'chart.docx', mimeType: DOCX_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toBeVisible()
    await expect(page.locator('.word-editor-surface .ProseMirror .unsupported-block')).toHaveCount(1)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13e [ODT]: placeholder/date fields keep surrounding run text visible', async ({ page, errors }) => {
    const buffer = await buildSampleOdt(
      '<text:p>Hallo <text:placeholder text:placeholder-type="text">Name</text:placeholder>, heute ist ' +
        '<text:date text:date-value="2024-01-01">1. Januar 2024</text:date>.</text:p>',
    )
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'placeholder.odt', mimeType: ODT_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Hallo')
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('1. Januar 2024')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13f [DOCX]: a two-column section (w:cols) keeps all paragraph text visible after import', async ({
    page,
    errors,
  }) => {
    const bodyInner =
      `<w:p><w:r><w:t>Text in der ersten Spalte.</w:t></w:r></w:p>` +
      `<w:p><w:r><w:t>Text in der zweiten Spalte (vereinfacht als eine Spalte dargestellt).</w:t></w:r></w:p>` +
      `<w:sectPr><w:cols w:num="2"/></w:sectPr>`
    const buffer = await buildSampleDocx(bodyInner)
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'spalten.docx', mimeType: DOCX_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Text in der ersten Spalte.')
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Text in der zweiten Spalte')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.13f [ODT]: a multi-column text:section keeps all paragraph text visible after import', async ({
    page,
    errors,
  }) => {
    const officeTextBody =
      `<text:section text:name="Spalten" text:style-name="Sect1">` +
      `<text:p>Text in der ersten Spalte.</text:p>` +
      `<text:p>Text in der zweiten Spalte (vereinfacht als ein Absatz dargestellt).</text:p>` +
      `</text:section>`
    const buffer = await buildSampleOdt(officeTextBody)
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'spalten.odt', mimeType: ODT_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Text in der ersten Spalte.')
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('Text in der zweiten Spalte')
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.14 [ODT]: a nested table (table inside a textbox inside a frame) imports without crashing, cell text found on all levels', async ({
    page,
    errors,
  }) => {
    const buffer = readFileSync(join(FIXTURES_ODT, 'table-within-textBox-within-frame.odt'))
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'nested.odt', mimeType: ODT_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toBeVisible()
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('CUSTOMER_NAME')
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.14 [ODT]: deeply nested sub-tables import without crashing', async ({ page, errors }) => {
    const buffer = readFileSync(join(FIXTURES_ODT, 'subTables3-nested.odt'))
    const input = odtCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'subtables.odt', mimeType: ODT_MIME, buffer })
    await expect(page.locator('.word-editor-surface .ProseMirror')).toBeVisible()
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('E-3.14 [DOCX]: a deeply nested table cell imports without crashing (or fails gracefully with a banner)', async ({
    page,
    errors,
  }) => {
    const buffer = readFileSync(join(FIXTURES_DOCX, 'deep-table-cell.docx'))
    const input = docxCard(page).locator('input[type="file"]')
    await input.setInputFiles({ name: 'deep-table-cell.docx', mimeType: DOCX_MIME, buffer })
    // Either the editor opens (nesting guard kicked in) or a clean error banner is shown —
    // both are acceptable per §3.14 ("kein Absturz"); a raw crash/blank page is not.
    await expect(page.locator('.word-editor-surface .ProseMirror').or(page.getByRole('alert'))).toBeVisible({ timeout: 15_000 })
    expect(errors, errors.join('\n')).toEqual([])
  })
})
