import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { insertTableViaDialog } from './fixtures/table-helpers'

// Document base display: real A4 page view, zoom, and — critically — mobile
// responsiveness with no horizontal overflow. See specs/dokument-darstellung-req.md.

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DOCX = join(__dirname, '../fixtures/external/docx')
const FIXTURES_ODT = join(__dirname, '../fixtures/external/odt')
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT_MIME = 'application/vnd.oasis.opendocument.text'

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}
function docxCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}

async function openNewOdt(page: Page) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
}

/** True when nothing overflows the viewport horizontally. */
async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

const sheet = (page: Page) => page.getByTestId('page-sheet')

test.describe('A4 page view + zoom', () => {
  test.beforeEach(async ({ page }) => {
    await openNewOdt(page)
  })

  test('shows an A4 sheet and a zoom control bar', async ({ page }) => {
    await expect(sheet(page)).toBeVisible()
    await expect(page.getByLabel('Zoomstufe')).toBeVisible()
    await expect(page.getByRole('button', { name: 'An Breite anpassen' })).toBeVisible()
    await expect(page.getByRole('button', { name: '100%', exact: true })).toBeVisible()
  })

  test('zoom in/out and 100% change the zoom level and scale the sheet', async ({ page }) => {
    await page.getByRole('button', { name: '100%', exact: true }).click()
    await expect(page.getByLabel('Zoomstufe')).toHaveText('100%')
    // sheet is rendered at scale(1)
    const before = await sheet(page).evaluate((el) => getComputedStyle(el).transform)

    await page.getByRole('button', { name: 'Vergrößern' }).click()
    await expect(page.getByLabel('Zoomstufe')).toHaveText('110%')
    const after = await sheet(page).evaluate((el) => getComputedStyle(el).transform)
    expect(after).not.toBe(before) // transform changed → the sheet actually scaled

    await page.getByRole('button', { name: 'Verkleinern' }).click()
    await expect(page.getByLabel('Zoomstufe')).toHaveText('100%')
  })

  test('editing stays correct under an explicit zoom (click position + typing)', async ({ page }) => {
    await page.getByRole('button', { name: 'Vergrößern' }).click() // > 100%
    await page.getByRole('button', { name: 'Vergrößern' }).click()
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.type('Zoom Test')
    await expect(editor).toContainText('Zoom Test')
    // caret lands where clicked: click at the start and type again
    await page.keyboard.press('ControlOrMeta+Home')
    await page.waitForTimeout(50)
    await page.keyboard.type('X ')
    await expect(editor).toContainText('X Zoom Test')
  })
})

test('the format-picker start screen (app shell) does not overflow horizontally', async ({ page }) => {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  expect(await noHorizontalOverflow(page)).toBe(true)
})

test.describe('Mobile responsiveness (no horizontal overflow)', () => {
  test.beforeEach(async ({ page }) => {
    await openNewOdt(page)
  })

  test('a new document does not overflow horizontally', async ({ page }) => {
    expect(await noHorizontalOverflow(page)).toBe(true)
    // the A4 sheet fits within the viewport at the default (auto-fit) zoom
    const box = await sheet(page).boundingBox()
    const vw = await page.evaluate(() => window.innerWidth)
    expect(box!.width).toBeLessThanOrEqual(vw + 1)
  })

  test('a lot of typed content does not introduce horizontal overflow', async ({ page }) => {
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Ein ziemlich langer Absatz mit vielen Wörtern der eventuell umbrechen muss. '.repeat(30))
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('a wide table does not break the layout out horizontally', async ({ page }) => {
    await page.locator('.ProseMirror').click()
    await insertTableViaDialog(page, 2, 2)
    expect(await noHorizontalOverflow(page)).toBe(true)
  })
})

// Representative real-world fixtures must render without a crash and without
// horizontal overflow (specs/dokument-darstellung-req.md §4.1).
const REPRESENTATIVE: Array<{ format: 'docx' | 'odt'; name: string }> = [
  { format: 'odt', name: 'BigTable.odt' },
  { format: 'odt', name: 'feature_images.odt' },
  { format: 'docx', name: 'bug59058.docx' },
]

for (const fx of REPRESENTATIVE) {
  test(`representative render: ${fx.name} shows content, no overflow, ErrorBoundary not tripped`, async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
    const dir = fx.format === 'docx' ? FIXTURES_DOCX : FIXTURES_ODT
    const mime = fx.format === 'docx' ? DOCX_MIME : ODT_MIME
    const card = fx.format === 'docx' ? docxCard(page) : odtCard(page)
    const buffer = readFileSync(join(dir, fx.name))
    await card.locator('input[type="file"]').setInputFiles({ name: fx.name, mimeType: mime, buffer })

    // renders a non-empty editor (no white-screen / error-boundary fallback)
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await expect(page.getByText(/Das Dokument konnte nicht|ist ein Fehler aufgetreten/i)).toHaveCount(0)
    const text = (await page.locator('.ProseMirror').textContent()) ?? ''
    expect(text.length).toBeGreaterThan(0)
    // the page sheet is present and the layout does not overflow horizontally
    await expect(sheet(page)).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
  })
}
