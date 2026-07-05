import { test, expect, type Page } from '@playwright/test'

// Table-structure editing: insert/delete row & column as one toolbar block.
// See specs/tabelle-struktur-bearbeiten-req.md. Runs on Desktop Chrome, Mobile
// (Pixel 7) and Tablet (iPad Mini) — the touch projects cover Grenzfall 23.

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}

const tableRows = (page: Page) => page.locator('.ProseMirror table tr')
const firstRowCells = (page: Page) => page.locator('.ProseMirror table tr').first().locator('td, th')
const tables = (page: Page) => page.locator('.ProseMirror table')

async function openEditor(page: Page) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await expect(editor).toBeVisible()
  return editor
}

/** Inserts the default 2×2 table and puts the cursor in its first cell. */
async function insertTableAndFocusCell(page: Page) {
  await page.locator('.ProseMirror').click()
  await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
  await expect(tables(page)).toHaveCount(1)
  await page.locator('.ProseMirror td').first().click()
}

test.describe('Tabellenstruktur-Bedienblock', () => {
  test('all six buttons are disabled outside a table and enabled inside one', async ({ page }) => {
    await openEditor(page)
    await page.locator('.ProseMirror').click()
    for (const name of [
      'Zeile oberhalb einfügen',
      'Zeile unterhalb einfügen',
      'Zeile löschen',
      'Spalte links einfügen',
      'Spalte rechts einfügen',
      'Spalte löschen',
    ]) {
      await expect(page.getByRole('button', { name })).toBeDisabled()
    }
    await insertTableAndFocusCell(page)
    for (const name of [
      'Zeile oberhalb einfügen',
      'Zeile unterhalb einfügen',
      'Zeile löschen',
      'Spalte links einfügen',
      'Spalte rechts einfügen',
      'Spalte löschen',
    ]) {
      await expect(page.getByRole('button', { name })).toBeEnabled()
    }
  })

  test('insert row below/above adds exactly one row', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    await expect(tableRows(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Zeile unterhalb einfügen' }).click()
    await expect(tableRows(page)).toHaveCount(3)
    await page.locator('.ProseMirror td').first().click()
    await page.getByRole('button', { name: 'Zeile oberhalb einfügen' }).click()
    await expect(tableRows(page)).toHaveCount(4)
  })

  test('insert column right/left adds exactly one column', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    await expect(firstRowCells(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Spalte rechts einfügen' }).click()
    await expect(firstRowCells(page)).toHaveCount(3)
    await page.locator('.ProseMirror td').first().click()
    await page.getByRole('button', { name: 'Spalte links einfügen' }).click()
    await expect(firstRowCells(page)).toHaveCount(4)
  })

  test('delete row removes one row; delete column removes one column', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    await expect(tableRows(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Zeile löschen' }).click()
    await expect(tableRows(page)).toHaveCount(1)

    await page.locator('.ProseMirror td').first().click()
    await expect(firstRowCells(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Spalte löschen' }).click()
    await expect(firstRowCells(page)).toHaveCount(1)
  })

  test('deleting the last remaining row removes the whole table (no silent no-op)', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    await page.getByRole('button', { name: 'Zeile löschen' }).click()
    await expect(tableRows(page)).toHaveCount(1)
    await page.locator('.ProseMirror td').first().click()
    await page.getByRole('button', { name: 'Zeile löschen' }).click()
    await expect(tables(page)).toHaveCount(0)
    // editor stays usable: a paragraph remains and accepts typing
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('nach der Tabelle')
    await expect(page.locator('.ProseMirror')).toContainText('nach der Tabelle')
  })

  test('a table-op button activates via the keyboard (Enter), not only the mouse', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    await expect(tableRows(page)).toHaveCount(2)
    // Focus the button and press Enter — the failure mode a mouse-only click() would hide.
    await page.getByRole('button', { name: 'Zeile unterhalb einfügen' }).focus()
    await page.keyboard.press('Enter')
    await expect(tableRows(page)).toHaveCount(3)
    // Space must work too.
    await page.locator('.ProseMirror td').first().click()
    await page.getByRole('button', { name: 'Zeile unterhalb einfügen' }).focus()
    await page.keyboard.press('Space')
    await expect(tableRows(page)).toHaveCount(4)
  })

  test('undo restores a deleted row in one step', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    await expect(tableRows(page)).toHaveCount(2)
    // prosemirror-history groups doc changes that land within ~500ms (newGroupDelay) into
    // one undo step. In a real session the table insert and a later row delete are seconds
    // apart; the test runs them back-to-back, so we wait past the group delay to make the
    // delete its own undo step (same reason the paste "single undo step" test waits). This
    // reflects real behaviour, not a workaround for a bug.
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Zeile löschen' }).click()
    await expect(tableRows(page)).toHaveCount(1)
    // The editor is focused after the toolbar op (runTable → view.focus()); undo directly.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(tableRows(page)).toHaveCount(2)
  })

  test('deleting the last remaining column removes the whole table (browser, DoD §6.7)', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    await expect(firstRowCells(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Spalte löschen' }).click()
    await expect(firstRowCells(page)).toHaveCount(1)
    await page.locator('.ProseMirror td').first().click()
    await page.getByRole('button', { name: 'Spalte löschen' }).click()
    await expect(tables(page)).toHaveCount(0)
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('geht weiter')
    await expect(page.locator('.ProseMirror')).toContainText('geht weiter')
  })

  test('undo restores the whole table after it was auto-removed by deleting its last row', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    await page.waitForTimeout(600) // separate the insert from the deletes (newGroupDelay)
    await page.getByRole('button', { name: 'Zeile löschen' }).click()
    await expect(tableRows(page)).toHaveCount(1)
    await page.locator('.ProseMirror td').first().click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Zeile löschen' }).click()
    await expect(tables(page)).toHaveCount(0)
    // the auto-removal is a single undo step → one Ctrl+Z brings the table back
    await page.keyboard.press('ControlOrMeta+z')
    await expect(tables(page)).toHaveCount(1)
    await expect(tableRows(page)).toHaveCount(1)
  })

  test('operations on a long, multi-page table stay correct and responsive (Grenzfall 15/16)', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    // Grow the table to many rows (spanning more than one A4 page) via the toolbar itself.
    for (let i = 0; i < 14; i++) {
      await page.getByRole('button', { name: 'Zeile unterhalb einfügen' }).click()
    }
    await expect(tableRows(page)).toHaveCount(16)
    // An operation in the middle changes only the affected spot and stays responsive.
    await page.locator('.ProseMirror td').nth(10).click()
    const start = Date.now()
    await page.getByRole('button', { name: 'Zeile löschen' }).click()
    await expect(tableRows(page)).toHaveCount(15)
    expect(Date.now() - start).toBeLessThan(5000) // no freeze on a long table
  })

  test('a dragged cell selection is visibly highlighted (.selectedCell) before deleting', async ({ page }) => {
    await openEditor(page)
    await insertTableAndFocusCell(page)
    const c0 = await page.locator('.ProseMirror td').nth(0).boundingBox()
    const c1 = await page.locator('.ProseMirror td').nth(1).boundingBox()
    await page.mouse.move(c0!.x + c0!.width / 2, c0!.y + c0!.height / 2)
    await page.mouse.down()
    await page.mouse.move(c1!.x + c1!.width / 2, c1!.y + c1!.height / 2, { steps: 6 })
    await page.mouse.up()
    const selected = page.locator('.ProseMirror .selectedCell')
    await expect(selected.first()).toBeVisible()
    // the highlight overlay actually paints something (non-transparent ::after)
    const painted = await selected.first().evaluate((el) => {
      const bg = getComputedStyle(el, '::after').backgroundColor
      return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
    })
    expect(painted).toBe(true)
  })
})
