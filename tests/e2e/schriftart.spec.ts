import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'

// Schriftart wählen (specs/schriftart-waehlen-req.md §1/§7): Combobox mit kuratierter
// Liste + „Im Dokument verwendet", Live-Vorschau, Filter mit Kein-Treffer-Hinweis,
// Tastaturbedienung (Pfeile/Enter/Escape/Tab-ohne-Übernahme), gemischt = leer,
// Entfernen-Button, Rundreisen mit Roh-XML-Assertions.

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}
function docxCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT_MIME = 'application/vnd.oasis.opendocument.text'
const editor = (page: Page) => page.locator('.ProseMirror')
const combo = (page: Page) => page.getByRole('combobox', { name: 'Schriftart' })
const listbox = (page: Page) => page.getByRole('listbox', { name: 'Schriftarten' })

async function openEditor(page: Page, card: (p: Page) => ReturnType<typeof odtCard> = odtCard) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await card(page).getByRole('button', { name: 'Neu erstellen' }).click()
  await expect(editor(page)).toBeVisible()
  await editor(page).click()
}

async function typeAndSelect(page: Page, text: string, count: number) {
  await page.keyboard.type(text)
  for (let i = 0; i < count; i++) await page.keyboard.press('Shift+ArrowLeft', { delay: 20 })
  await page.waitForTimeout(50)
}

async function exportBytes(page: Page): Promise<Buffer> {
  const fs = await import('node:fs/promises')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  return fs.readFile((await (await downloadPromise).path())!)
}

async function reimport(
  page: Page,
  card: (p: Page) => ReturnType<typeof odtCard>,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  await page.getByRole('button', { name: /formate/i }).click()
  await card(page).locator('input[type="file"]').setInputFiles({ name, mimeType, buffer })
  await expect(editor(page)).toBeVisible()
}

test('Auswahl aus der kuratierten Liste: Klick setzt die Schrift sichtbar, Feld zeigt den Namen (§1 #1/#5)', async ({
  page,
}) => {
  await openEditor(page)
  await typeAndSelect(page, 'schöner Text', 'schöner Text'.length)
  await combo(page).click()
  const option = listbox(page).getByRole('option', { name: 'Georgia' })
  await expect(option).toHaveCSS('font-family', /Georgia/) // Live-Vorschau (§1 #5)
  await option.click()
  const styled = editor(page).locator('span[style*="font-family"]')
  await expect(styled).toHaveText('schöner Text')
  await expect(styled).toHaveCSS('font-family', /Georgia/)
  await expect(combo(page)).toHaveValue('Georgia')
})

test('Freitext: unkuratierter Name per Enter, exakt erhalten (§1 #3, §2.7)', async ({ page }) => {
  await openEditor(page)
  await typeAndSelect(page, 'frei', 4)
  await combo(page).fill('Fira Sans Condensed')
  await combo(page).press('Enter')
  await expect(editor(page).locator('span[style*="font-family"]')).toHaveCSS('font-family', /Fira Sans Condensed/)
  await expect(combo(page)).toHaveValue('Fira Sans Condensed')
})

test('Filter: Teilstring case-insensitive; kein Treffer → sichtbarer Hinweis (§1 #6, 3.11)', async ({ page }) => {
  await openEditor(page)
  await combo(page).click()
  await combo(page).fill('geor')
  await expect(listbox(page).getByRole('option', { name: 'Georgia' })).toBeVisible()
  await expect(listbox(page).getByRole('option', { name: 'Arial' })).toHaveCount(0)
  await combo(page).fill('xyz-gibt-es-nicht')
  await expect(listbox(page)).toContainText('Keine Schriftart gefunden')
})

test('Pfeilnavigation + Enter übernimmt den hervorgehobenen Eintrag (§1 #7)', async ({ page }) => {
  await openEditor(page)
  await typeAndSelect(page, 'pfeil', 5)
  await combo(page).click()
  // Start-Hervorhebung steht auf Eintrag 1 (Arial); EIN Pfeil-runter → Calibri
  await combo(page).press('ArrowDown')
  await combo(page).press('Enter')
  await expect(combo(page)).toHaveValue('Calibri')
  await expect(editor(page).locator('span[style*="font-family"]')).toHaveCSS('font-family', /Calibri/)
})

test('Escape schließt ohne Änderung; Tab übernimmt NIE still (§1 #7, §4.8)', async ({ page }) => {
  await openEditor(page)
  await typeAndSelect(page, 'stabil', 6)
  await combo(page).click()
  await combo(page).fill('Verd')
  await combo(page).press('Escape')
  await expect(editor(page).locator('span[style*="font-family"]')).toHaveCount(0)
  await expect(combo(page)).toHaveValue('')

  await combo(page).click()
  await combo(page).press('ArrowDown')
  await combo(page).press('Tab')
  await expect(editor(page).locator('span[style*="font-family"]')).toHaveCount(0)
  await expect(listbox(page)).toHaveCount(0) // Liste geschlossen
})

test('gemischte Selektion → leeres Feld; Entfernen-Button löscht nur den Schriftart-Mark (§1 #8/#14)', async ({
  page,
}) => {
  await openEditor(page)
  await page.getByTitle('Fett').click()
  await typeAndSelect(page, 'zwei Schriften', 9)
  await combo(page).click()
  await listbox(page).getByRole('option', { name: 'Verdana' }).click()
  await page.keyboard.press('ControlOrMeta+a')
  await expect(combo(page)).toHaveValue('') // gemischt (§1 #8)

  const clearButton = page.getByRole('button', { name: 'Schriftart entfernen' })
  // erst Cursor in den verlinkten... in den Verdana-Teil setzen → Button aktiv
  await editor(page).locator('span[style*="font-family"]').click()
  await expect(clearButton).toBeEnabled()
  await page.keyboard.press('ControlOrMeta+a')
  await clearButton.click()
  await expect(editor(page).locator('span[style*="font-family"]')).toHaveCount(0)
  await expect(editor(page).locator('strong')).toContainText('Schriften') // Fett bleibt
})

test('„Im Dokument verwendet": gesetzte Schrift erscheint als eigene Gruppe zuoberst (§1 #4)', async ({ page }) => {
  await openEditor(page)
  await typeAndSelect(page, 'markiert', 8)
  await combo(page).fill('Spezialschrift AG')
  await combo(page).press('Enter')
  await editor(page).click()
  await combo(page).click()
  const group = listbox(page).getByRole('group', { name: 'Im Dokument verwendet' })
  await expect(group.getByRole('option', { name: 'Spezialschrift AG' })).toBeVisible()
})

for (const fmt of ['docx', 'odt'] as const) {
  test(`Rundreise ${fmt.toUpperCase()}: gewählte Schrift übersteht Export → Reimport exakt (§6)`, async ({
    page,
  }) => {
    const card = fmt === 'docx' ? docxCard : odtCard
    await openEditor(page, card)
    await page.keyboard.type('vor ')
    await typeAndSelect(page, 'schön', 5)
    await combo(page).click()
    await listbox(page).getByRole('option', { name: 'Times New Roman' }).click()
    const buffer = await exportBytes(page)

    const zip = await JSZip.loadAsync(buffer)
    if (fmt === 'docx') {
      const xml = await zip.file('word/document.xml')!.async('text')
      expect(xml).toContain(
        '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>',
      )
    } else {
      const xml = await zip.file('content.xml')!.async('text')
      expect(xml).toContain('style:font-name="Times New Roman"')
      expect(xml).toContain('<style:font-face style:name="Times New Roman"')
    }

    await reimport(page, card, `schrift.${fmt}`, fmt === 'docx' ? DOCX_MIME : ODT_MIME, buffer)
    const styled = editor(page).locator('span[style*="font-family"]')
    await expect(styled).toHaveText('schön')
    await styled.click()
    await expect(combo(page)).toHaveValue('Times New Roman')
  })
}
