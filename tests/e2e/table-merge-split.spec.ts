import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { insertTableViaDialog } from './fixtures/table-helpers'

// Cell merge / split (specs/zellen-verbinden-req.md). Runs on Desktop Chrome, Mobile
// (Pixel 7) and Tablet (iPad Mini). Multi-cell selection is done via page.mouse drag; the
// touch-specific selection question (Grenzfall 10) is addressed in the spec §9.

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}

const firstRowCells = (page: Page) => page.locator('.ProseMirror table tr').first().locator('td, th')
const cellAt = (page: Page, i: number) => page.locator('.ProseMirror td').nth(i)

async function openEditorWithTable(page: Page) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await page.locator('.ProseMirror').click()
  await insertTableViaDialog(page, 2, 2)
  await expect(page.locator('.ProseMirror table')).toHaveCount(1)
}

/** Selects a rectangular range of cells with a real mouse drag from cell `a` to cell `b`. */
async function dragSelectCells(page: Page, a: number, b: number) {
  const boxA = await cellAt(page, a).boundingBox()
  const boxB = await cellAt(page, b).boundingBox()
  await page.mouse.move(boxA!.x + boxA!.width / 2, boxA!.y + boxA!.height / 2)
  await page.mouse.down()
  await page.mouse.move(boxB!.x + boxB!.width / 2, boxB!.y + boxB!.height / 2, { steps: 8 })
  await page.mouse.up()
}

test.describe('Zellen verbinden/teilen', () => {
  test('drag-selecting two cells highlights them and enables "Zellen verbinden"', async ({ page }) => {
    await openEditorWithTable(page)
    // initially (single cursor) both buttons are disabled
    await cellAt(page, 0).click()
    await expect(page.getByRole('button', { name: 'Zellen verbinden' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Zelle teilen' })).toBeDisabled()

    await dragSelectCells(page, 0, 1)
    await expect(page.locator('.ProseMirror .selectedCell').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zellen verbinden' })).toBeEnabled()
  })

  test('merging two horizontally adjacent cells yields one cell spanning both columns', async ({ page }) => {
    await openEditorWithTable(page)
    await expect(firstRowCells(page)).toHaveCount(2)
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    await expect(firstRowCells(page)).toHaveCount(1)
  })

  test('typing immediately after a merge APPENDS, it does not replace the merged content', async ({ page }) => {
    await openEditorWithTable(page)
    await cellAt(page, 0).click()
    await page.keyboard.type('AAA')
    await cellAt(page, 1).click()
    await page.keyboard.type('BBB')
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    // the merged cell already holds both contents...
    await expect(cellAt(page, 0)).toContainText('AAA')
    await expect(cellAt(page, 0)).toContainText('BBB')
    // ...and typing right away (no extra click) adds to it instead of wiping it (req §2.3)
    await page.keyboard.type('XYZ')
    await expect(cellAt(page, 0)).toContainText('AAA')
    await expect(cellAt(page, 0)).toContainText('BBB')
    await expect(cellAt(page, 0)).toContainText('XYZ')
  })

  test('splitting a merged cell restores the columns; typing after split does not replace', async ({ page }) => {
    await openEditorWithTable(page)
    await cellAt(page, 0).click()
    await page.keyboard.type('behalten')
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    await expect(firstRowCells(page)).toHaveCount(1)
    // now split it back
    await cellAt(page, 0).click()
    await expect(page.getByRole('button', { name: 'Zelle teilen' })).toBeEnabled()
    await page.getByRole('button', { name: 'Zelle teilen' }).click()
    await expect(firstRowCells(page)).toHaveCount(2)
    await expect(cellAt(page, 0)).toContainText('behalten')
    // typing right after split appends to the top-left cell, does not wipe it
    await page.keyboard.type('!')
    await expect(cellAt(page, 0)).toContainText('behalten!')
  })

  test('"Zellen verbinden" activates via the keyboard (Enter), not only the mouse', async ({ page }) => {
    await openEditorWithTable(page)
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).focus()
    await page.keyboard.press('Enter')
    await expect(firstRowCells(page)).toHaveCount(1)
  })

  test('undo restores the two cells after a merge, redo re-applies it (both one step)', async ({ page }) => {
    await openEditorWithTable(page)
    await page.waitForTimeout(600) // separate the table insert from the merge (newGroupDelay)
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    await expect(firstRowCells(page)).toHaveCount(1)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(firstRowCells(page)).toHaveCount(2)
    await page.keyboard.press('ControlOrMeta+y')
    await expect(firstRowCells(page)).toHaveCount(1)
  })

  test('"Zellen verbinden" also activates via the SPACE key (req §5.2 #8, both keys)', async ({ page }) => {
    await openEditorWithTable(page)
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).focus()
    await page.keyboard.press('Space')
    await expect(firstRowCells(page)).toHaveCount(1)
  })

  test('vertical merge produces a rowspan=2 cell', async ({ page }) => {
    await openEditorWithTable(page)
    await dragSelectCells(page, 0, 2) // column 0: cells (0,0) and (1,0)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    await expect(page.locator('.ProseMirror td[rowspan="2"]')).toHaveCount(1)
  })

  test('rectangular 2×2 merge produces one colspan=2, rowspan=2 cell', async ({ page }) => {
    await openEditorWithTable(page)
    await dragSelectCells(page, 0, 3) // all four cells
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    await expect(page.locator('.ProseMirror td[colspan="2"][rowspan="2"]')).toHaveCount(1)
    await expect(page.locator('.ProseMirror td')).toHaveCount(1)
  })

  test('a single-cell selection keeps "Zellen verbinden" disabled', async ({ page }) => {
    await openEditorWithTable(page)
    await cellAt(page, 0).click()
    await expect(page.getByRole('button', { name: 'Zellen verbinden' })).toBeDisabled()
  })

  test('selection-sync: after a merge, clicking another cell and typing keeps all content', async ({ page }) => {
    await openEditorWithTable(page)
    await cellAt(page, 0).click()
    await page.keyboard.type('KOPF')
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    // reposition into another cell and type — must not swallow the merged content
    await cellAt(page, 1).click() // a row-1 cell (row 0 is now a single merged cell)
    await page.keyboard.type('ZELLE2')
    await expect(page.locator('.ProseMirror')).toContainText('KOPF')
    await expect(page.locator('.ProseMirror')).toContainText('ZELLE2')
  })

  test('a self-made merge survives deleting a non-crossing column (interaction, DoD §6.8)', async ({ page }) => {
    await openEditorWithTable(page)
    // widen to 3 columns, then merge the first two cells of row 0
    await cellAt(page, 0).click()
    await page.getByRole('button', { name: 'Spalte rechts einfügen' }).click()
    await expect(firstRowCells(page)).toHaveCount(3)
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    await expect(page.locator('.ProseMirror td[colspan="2"]')).toHaveCount(1)
    // delete the last (right-most, non-crossing) column → merge stays intact, no crash
    await page.locator('.ProseMirror td').last().click()
    await page.getByRole('button', { name: 'Spalte löschen' }).click()
    await expect(page.locator('.ProseMirror table')).toHaveCount(1)
    await expect(page.locator('.ProseMirror td[colspan="2"]')).toHaveCount(1)
  })

  test('round trip: a merged cell exported to ODT carries number-columns-spanned in the raw XML', async ({
    page,
  }) => {
    await openEditorWithTable(page)
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    await expect(firstRowCells(page)).toHaveCount(1)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const fs = await import('node:fs/promises')
    const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!))
    const contentXml = await zip.file('content.xml')!.async('text')
    expect(contentXml).toMatch(/table:number-columns-spanned="2"/)
  })

  test('full browser round trip: merge → export → re-import the file → split it again', async ({ page }) => {
    await openEditorWithTable(page)
    await cellAt(page, 0).click()
    await page.keyboard.type('behalten')
    await dragSelectCells(page, 0, 1)
    await page.getByRole('button', { name: 'Zellen verbinden' }).click()
    await expect(page.locator('.ProseMirror td[colspan="2"]')).toHaveCount(1)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const path = await (await downloadPromise).path()

    // go back to the picker and re-import the exported file through the ODT card
    await page.getByRole('button', { name: '← Formate' }).click()
    await odtCard(page).locator('input[type="file"]').setInputFiles(path!)
    await expect(page.locator('.ProseMirror')).toBeVisible()

    // the merge (and its content) survived the real export/reimport
    await expect(page.locator('.ProseMirror td[colspan="2"]')).toHaveCount(1)
    await expect(page.locator('.ProseMirror')).toContainText('behalten')

    // and the re-imported merged cell can be split again
    await page.locator('.ProseMirror td[colspan="2"]').click()
    await expect(page.getByRole('button', { name: 'Zelle teilen' })).toBeEnabled()
    await page.getByRole('button', { name: 'Zelle teilen' }).click()
    await expect(page.locator('.ProseMirror td[colspan="2"]')).toHaveCount(0)
    await expect(firstRowCells(page)).toHaveCount(2)
  })
})
