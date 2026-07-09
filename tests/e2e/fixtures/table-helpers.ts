import { expect, type Page } from '@playwright/test'

/**
 * Inserts a `rows`×`cols` table through the size chooser dialog (which replaced the old
 * fixed 2×2 direct insert — see specs/tabelle-erstellen-loeschen-req.md). Defaults to 2×2 so
 * existing tests that relied on the previous behaviour keep their structure assumptions.
 * Uses the number fields (the deterministic, project-independent path) rather than the grid.
 */
export async function insertTableViaDialog(page: Page, rows = 2, cols = 2) {
  await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tabelle einfügen' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Zeilen').fill(String(rows))
  await dialog.getByLabel('Spalten').fill(String(cols))
  await dialog.getByRole('button', { name: 'Einfügen' }).click()
  await expect(dialog).toBeHidden()
}
