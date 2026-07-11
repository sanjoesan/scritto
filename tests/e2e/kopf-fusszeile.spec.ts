import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'

// Kopf-/Fußzeile bearbeiten, Scheibe A (kopfzeile-/fusszeile-bearbeiten-req.md §1/§3):
// Aktivieren über die gemeinsamen Toolbar-Toggles, eigener editierbarer Bereich im
// Seitenrand, Toolbar-Kontextbindung an die fokussierte Instanz, eigene Undo-Historie,
// Entfernen mit Bestätigung, Rundreisen DOCX (header1/footer1.xml) und ODT (styles.xml).

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}
function docxCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT_MIME = 'application/vnd.oasis.opendocument.text'
const bodyEditor = (page: Page) => page.locator('.word-editor-surface .ProseMirror')
const headerEditor = (page: Page) => page.getByTestId('header-editor').locator('.ProseMirror')
const footerEditor = (page: Page) => page.getByTestId('footer-editor').locator('.ProseMirror')
const headerButton = (page: Page) => page.getByRole('button', { name: 'Kopfzeile', exact: true })
const footerButton = (page: Page) => page.getByRole('button', { name: 'Fußzeile', exact: true })

async function openEditor(page: Page, card: (p: Page) => ReturnType<typeof odtCard> = odtCard) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await card(page).getByRole('button', { name: 'Neu erstellen' }).click()
  await expect(bodyEditor(page)).toBeVisible()
  await bodyEditor(page).click()
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
  await expect(bodyEditor(page)).toBeVisible()
}

test('Kopfzeile aktivieren: Bereich mit Label erscheint, ist fokussiert und beschreibbar (§1 #1/#3)', async ({
  page,
}) => {
  await openEditor(page)
  await expect(headerButton(page)).toHaveAttribute('aria-pressed', 'false')
  await headerButton(page).click()
  await expect(headerButton(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('header-editor')).toContainText('Kopfzeile') // Label
  await page.keyboard.type('Briefkopf')
  await expect(headerEditor(page)).toHaveText('Briefkopf')
  await expect(bodyEditor(page)).not.toContainText('Briefkopf') // NUR die Kopfzeile
})

test('Toolbar bindet an die fokussierte Instanz: Fett wirkt in der Kopfzeile, nicht im Body (§1 #6)', async ({
  page,
}) => {
  await openEditor(page)
  await page.keyboard.type('Haupttext')
  await headerButton(page).click()
  await page.keyboard.type('Kopftext')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByTitle('Fett').click()
  await expect(headerEditor(page).locator('strong')).toHaveText('Kopftext')
  await expect(bodyEditor(page).locator('strong')).toHaveCount(0)
  // Seitenumbruch ist ein Body-Konzept → im Kopfzeilen-Kontext deaktiviert
  await expect(page.getByRole('button', { name: 'Seitenumbruch einfügen' })).toBeDisabled()
})

test('eigene Undo-Historie: Strg+Z in der Kopfzeile wirkt dort, Body bleibt unberührt', async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type('Bodyinhalt')
  await headerButton(page).click()
  await page.keyboard.type('Kopfinhalt')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(headerEditor(page)).not.toContainText('Kopfinhalt')
  await expect(bodyEditor(page)).toContainText('Bodyinhalt')
})

test('Klick zurück in den Haupttext: Tippen landet wieder im Body (§1 #4)', async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type('Anfang')
  await headerButton(page).click()
  await page.keyboard.type('Kopf')
  await bodyEditor(page).click()
  await page.keyboard.type('X')
  await expect(bodyEditor(page)).toContainText('AnfangX')
  await expect(headerEditor(page)).toHaveText('Kopf')
})

test('Entfernen mit Bestätigung: nicht-leere Fußzeile fragt nach und verschwindet (§1 #5)', async ({ page }) => {
  await openEditor(page)
  await footerButton(page).click()
  await page.keyboard.type('Seitenfuß')
  await expect(footerEditor(page)).toHaveText('Seitenfuß')
  await footerButton(page).click() // dialog-Handler akzeptiert das confirm
  await expect(page.getByTestId('footer-editor')).toHaveCount(0)
  await expect(footerButton(page)).toHaveAttribute('aria-pressed', 'false')
})

for (const fmt of ['docx', 'odt'] as const) {
  test(`Rundreise ${fmt.toUpperCase()}: Kopf- und Fußzeilen-Inhalt übersteht Export → Reimport (§6)`, async ({
    page,
  }) => {
    const card = fmt === 'docx' ? docxCard : odtCard
    await openEditor(page, card)
    await page.keyboard.type('Haupttext bleibt')
    await headerButton(page).click()
    await page.keyboard.type('Kopfzeilentext')
    await footerButton(page).click()
    await page.keyboard.type('Fußzeilentext')

    const buffer = await exportBytes(page)
    const zip = await JSZip.loadAsync(buffer)
    if (fmt === 'docx') {
      expect(await zip.file('word/header1.xml')!.async('text')).toContain('Kopfzeilentext')
      expect(await zip.file('word/footer1.xml')!.async('text')).toContain('Fußzeilentext')
    } else {
      const styles = await zip.file('styles.xml')!.async('text')
      expect(styles).toContain('Kopfzeilentext')
      expect(styles).toContain('Fußzeilentext')
    }

    await reimport(page, card, `hf.${fmt}`, fmt === 'docx' ? DOCX_MIME : ODT_MIME, buffer)
    await expect(headerEditor(page)).toHaveText('Kopfzeilentext')
    await expect(footerEditor(page)).toHaveText('Fußzeilentext')
    await expect(bodyEditor(page)).toContainText('Haupttext bleibt')
  })
}
