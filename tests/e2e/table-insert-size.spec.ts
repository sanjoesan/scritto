import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'

// "Tabelle einfügen mit Größenwahl" — the size-chooser dialog that replaced the old fixed 2×2
// insert. See specs/tabelle-erstellen-loeschen-req.md §2.1–2.4, §2.15, §4.1, §5.2.
// Runs on Desktop Chrome, Mobile (Pixel 7) and Tablet (iPad Mini).

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}
function docxCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Tabelle einfügen' })
const tableRows = (page: Page) => page.locator('.ProseMirror table tr')
const firstRowCells = (page: Page) => page.locator('.ProseMirror table tr').first().locator('td, th')
const tables = (page: Page) => page.locator('.ProseMirror table')

async function openEditor(page: Page, card: (p: Page) => ReturnType<typeof odtCard> = odtCard) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await card(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await expect(editor).toBeVisible()
  await editor.click()
  return editor
}

/** Exports via the real download and returns the file's bytes. */
async function exportBytes(page: Page): Promise<Buffer> {
  const fs = await import('node:fs/promises')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  return fs.readFile((await download.path())!)
}

/** Re-imports previously exported bytes through the real upload UI (back via "Formate"). */
async function reimport(
  page: Page,
  card: (p: Page) => ReturnType<typeof odtCard>,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  await page.getByRole('button', { name: /formate/i }).click()
  await card(page).locator('input[type="file"]').setInputFiles({ name, mimeType, buffer })
  await expect(page.locator('.ProseMirror')).toBeVisible()
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT_MIME = 'application/vnd.oasis.opendocument.text'

/** Types distinct text (Z1..Zn) into every cell of the single table on the page. */
async function fillAllCellsDistinct(page: Page) {
  const cells = page.locator('.ProseMirror td')
  const n = await cells.count()
  for (let i = 0; i < n; i++) {
    await cells.nth(i).click()
    await page.keyboard.type(`Z${i + 1}`)
  }
  return n
}

test.describe('Größenwahl-Dialog', () => {
  test('opens with focus on the first field and inserts the entered size via the number fields', async ({ page }) => {
    await openEditor(page)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByLabel('Zeilen')).toBeFocused()

    await dialog(page).getByLabel('Zeilen').fill('4')
    await dialog(page).getByLabel('Spalten').fill('3')
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()

    await expect(dialog(page)).toBeHidden()
    await expect(tables(page)).toHaveCount(1)
    await expect(tableRows(page)).toHaveCount(4)
    await expect(firstRowCells(page)).toHaveCount(3)
  })

  test('a grid-cell click inserts that size at once and closes the dialog', async ({ page }) => {
    await openEditor(page)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await expect(dialog(page)).toBeVisible()
    // grid cell titled "N × M" = N rows × M columns
    await page.getByTitle('4 × 3', { exact: true }).click()

    await expect(dialog(page)).toBeHidden()
    await expect(tableRows(page)).toHaveCount(4)
    await expect(firstRowCells(page)).toHaveCount(3)
  })

  test('confirming the 3×3 default inserts a sensible default table', async ({ page }) => {
    await openEditor(page)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
    await expect(tableRows(page)).toHaveCount(3)
    await expect(firstRowCells(page)).toHaveCount(3)
  })

  test('the 1×1 minimum and 20×20 maximum both insert correctly', async ({ page }) => {
    await openEditor(page)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByLabel('Zeilen').fill('1')
    await dialog(page).getByLabel('Spalten').fill('1')
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
    await expect(tableRows(page)).toHaveCount(1)
    await expect(firstRowCells(page)).toHaveCount(1)

    // and the 20×20 upper bound
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Delete')
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByLabel('Zeilen').fill('20')
    await dialog(page).getByLabel('Spalten').fill('20')
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
    await expect(tableRows(page)).toHaveCount(20)
    await expect(firstRowCells(page)).toHaveCount(20)
  })

  // A type=number field already blocks non-numeric/negative *entry* at the browser level, so
  // the states the app's own validation must still reject are: too small (0), too large (>20)
  // and empty. (The dialog also guards non-numeric text defensively — covered by the unit-level
  // parseDim check — but it can't be reached through a real number field, so it isn't e2e'd.)
  for (const { raw, name } of [
    { raw: '0', name: '0 (zu klein)' },
    { raw: '21', name: '21 (zu groß)' },
    { raw: '', name: 'leer' },
  ]) {
    test(`invalid input "${name}" shows an error and inserts nothing`, async ({ page }) => {
      await openEditor(page)
      await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
      await dialog(page).getByLabel('Zeilen').fill(raw)
      await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
      await expect(dialog(page).getByRole('alert')).toBeVisible()
      await expect(dialog(page)).toBeVisible() // stays open to correct the value
      await expect(tables(page)).toHaveCount(0)
    })
  }

  test('Escape, Abbrechen and a click outside all close the dialog without inserting', async ({ page }) => {
    await openEditor(page)
    // Escape
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(tables(page)).toHaveCount(0)
    // Abbrechen
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByRole('button', { name: 'Abbrechen' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(tables(page)).toHaveCount(0)
    // click outside (backdrop, near the top-left corner)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await expect(dialog(page)).toBeVisible()
    await page.mouse.click(5, 5)
    await expect(dialog(page)).toBeHidden()
    await expect(tables(page)).toHaveCount(0)
  })

  test('Undo removes the freshly inserted table, Redo brings it back', async ({ page }) => {
    await openEditor(page)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByLabel('Zeilen').fill('2')
    await dialog(page).getByLabel('Spalten').fill('2')
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
    await expect(tables(page)).toHaveCount(1)

    await page.locator('.ProseMirror').click()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(tables(page)).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+y')
    await expect(tables(page)).toHaveCount(1)
  })

  test('the insert button opens the dialog via keyboard Enter AND Space (not only mouse)', async ({ page }) => {
    await openEditor(page)
    const button = page.getByRole('button', { name: 'Tabelle einfügen' })
    await button.focus()
    await expect(button).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()

    await button.focus()
    await page.keyboard.press('Space')
    await expect(dialog(page)).toBeVisible()
  })

  test('every dialog control is a ≥40px tap target (§1.11/§2.14): grid cells, fields, buttons', async ({ page }) => {
    await openEditor(page)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await expect(dialog(page)).toBeVisible()

    // Grid cells are all sized identically — measure the corners of the preview grid.
    for (const title of ['1 × 1', '4 × 3', '6 × 7']) {
      const box = await page.getByTitle(title, { exact: true }).boundingBox()
      expect(box!.width, `grid cell "${title}" width`).toBeGreaterThanOrEqual(40)
      expect(box!.height, `grid cell "${title}" height`).toBeGreaterThanOrEqual(40)
    }
    for (const label of ['Zeilen', 'Spalten']) {
      const box = await dialog(page).getByLabel(label).boundingBox()
      expect(box!.height, `field "${label}" height`).toBeGreaterThanOrEqual(40)
    }
    for (const name of ['Abbrechen', 'Einfügen']) {
      const box = await dialog(page).getByRole('button', { name }).boundingBox()
      expect(box!.height, `button "${name}" height`).toBeGreaterThanOrEqual(40)
    }
    // ...and the grid itself must not push the dialog card out of the viewport (Pixel 7 width).
    const card = await dialog(page).boundingBox()
    const vw = await page.evaluate(() => window.innerWidth)
    expect(card!.x).toBeGreaterThanOrEqual(0)
    expect(card!.x + card!.width).toBeLessThanOrEqual(vw + 1)
  })
})

test.describe('Rundreise: Größe und Zellinhalte bleiben über Export/Reimport erhalten (§4.1)', () => {
  test('DOCX: 4×3 mit unterschiedlichem Text je Zelle → exakt 4×3 im XML, Inhalte in Reihenfolge, Reimport identisch', async ({
    page,
  }) => {
    await openEditor(page, docxCard)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByLabel('Zeilen').fill('4')
    await dialog(page).getByLabel('Spalten').fill('3')
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
    await expect(tableRows(page)).toHaveCount(4)
    const cellCount = await fillAllCellsDistinct(page)
    expect(cellCount).toBe(12)

    const buffer = await exportBytes(page)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('text')
    expect((xml.match(/<w:tr\b/g) ?? []).length).toBe(4)
    // exactly 12 cells total (4 rows × 3 columns)
    expect((xml.match(/<w:tc\b/g) ?? []).length).toBe(12)
    // cell contents appear in document order → each cell's text landed in the right cell
    const positions = Array.from({ length: 12 }, (_, i) => xml.indexOf(`Z${i + 1}<`))
    for (const [i, pos] of positions.entries()) {
      expect(pos, `Z${i + 1} fehlt im XML`).toBeGreaterThan(-1)
      if (i > 0) expect(pos, `Z${i + 1} steht vor Z${i}`).toBeGreaterThan(positions[i - 1])
    }

    // §4.1.5: re-import the export — same structure, same cell contents at the same spots
    await reimport(page, docxCard, 'reimport-4x3.docx', DOCX_MIME, buffer)
    await expect(tableRows(page)).toHaveCount(4)
    await expect(firstRowCells(page)).toHaveCount(3)
    for (const i of [0, 4, 11]) {
      await expect(page.locator('.ProseMirror td').nth(i)).toHaveText(`Z${i + 1}`)
    }
  })

  test('ODT: 4×3 mit unterschiedlichem Text je Zelle → exakt 4×3 + 3 table-column im XML, Reimport identisch', async ({
    page,
  }) => {
    await openEditor(page, odtCard)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByLabel('Zeilen').fill('4')
    await dialog(page).getByLabel('Spalten').fill('3')
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
    await expect(tableRows(page)).toHaveCount(4)
    const cellCount = await fillAllCellsDistinct(page)
    expect(cellCount).toBe(12)

    const buffer = await exportBytes(page)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('content.xml')!.async('text')
    expect((xml.match(/<table:table-row\b/g) ?? []).length).toBe(4)
    expect((xml.match(/<table:table-cell\b/g) ?? []).length).toBe(12)
    // §4.1.3: the declared column count matches
    expect((xml.match(/<table:table-column\/>/g) ?? []).length).toBe(3)
    const positions = Array.from({ length: 12 }, (_, i) => xml.indexOf(`Z${i + 1}<`))
    for (const [i, pos] of positions.entries()) {
      expect(pos, `Z${i + 1} fehlt im XML`).toBeGreaterThan(-1)
      if (i > 0) expect(pos, `Z${i + 1} steht vor Z${i}`).toBeGreaterThan(positions[i - 1])
    }

    await reimport(page, odtCard, 'reimport-4x3.odt', ODT_MIME, buffer)
    await expect(tableRows(page)).toHaveCount(4)
    await expect(firstRowCells(page)).toHaveCount(3)
    for (const i of [0, 4, 11]) {
      await expect(page.locator('.ProseMirror td').nth(i)).toHaveText(`Z${i + 1}`)
    }
  })

  test('DOCX: der Raster-Weg (Klick auf 4×3-Rasterzelle) exportiert identisch zum Zahlenfeld-Weg (§4.1.2)', async ({
    page,
  }) => {
    await openEditor(page, docxCard)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await page.getByTitle('4 × 3', { exact: true }).click()
    await expect(tableRows(page)).toHaveCount(4)

    const zip = await JSZip.loadAsync(await exportBytes(page))
    const xml = await zip.file('word/document.xml')!.async('text')
    expect((xml.match(/<w:tr\b/g) ?? []).length).toBe(4)
    expect((xml.match(/<w:tc\b/g) ?? []).length).toBe(12)
  })

  test('Grenzfälle §4.1.4: 1×1 (DOCX) und 20×20 (ODT) überstehen Export UND Reimport strukturidentisch', async ({
    page,
  }) => {
    // 1×1 als DOCX
    await openEditor(page, docxCard)
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByLabel('Zeilen').fill('1')
    await dialog(page).getByLabel('Spalten').fill('1')
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
    await page.locator('.ProseMirror td').first().click()
    await page.keyboard.type('einzig')
    const docxBuffer = await exportBytes(page)
    const docxXml = await (await JSZip.loadAsync(docxBuffer)).file('word/document.xml')!.async('text')
    expect((docxXml.match(/<w:tr\b/g) ?? []).length).toBe(1)
    expect((docxXml.match(/<w:tc\b/g) ?? []).length).toBe(1)
    await reimport(page, docxCard, 'reimport-1x1.docx', DOCX_MIME, docxBuffer)
    await expect(tableRows(page)).toHaveCount(1)
    await expect(firstRowCells(page)).toHaveCount(1)
    await expect(page.locator('.ProseMirror td').first()).toHaveText('einzig')

    // 20×20 als ODT
    await page.getByRole('button', { name: /formate/i }).click()
    await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
    await page.locator('.ProseMirror').click()
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
    await dialog(page).getByLabel('Zeilen').fill('20')
    await dialog(page).getByLabel('Spalten').fill('20')
    await dialog(page).getByRole('button', { name: 'Einfügen' }).click()
    await expect(tableRows(page)).toHaveCount(20)
    const odtBuffer = await exportBytes(page)
    const odtXml = await (await JSZip.loadAsync(odtBuffer)).file('content.xml')!.async('text')
    expect((odtXml.match(/<table:table-row\b/g) ?? []).length).toBe(20)
    expect((odtXml.match(/<table:table-cell\b/g) ?? []).length).toBe(400)
    expect((odtXml.match(/<table:table-column\/>/g) ?? []).length).toBe(20)
    await reimport(page, odtCard, 'reimport-20x20.odt', ODT_MIME, odtBuffer)
    await expect(tableRows(page)).toHaveCount(20)
    await expect(firstRowCells(page)).toHaveCount(20)
  })
})
