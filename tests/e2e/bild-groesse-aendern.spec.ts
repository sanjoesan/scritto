import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { insertTableViaDialog } from './fixtures/table-helpers'

// Image resize (specs/bild-groesse-aendern-req.md). Runs on Desktop Chrome, Mobile, Tablet.
// After insertion the image is already node-selected, so the size panel is visible. A 1x1
// test image is used; the panel fields (the guaranteed keyboard/touch path) size it up so
// the handles become targetable.

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}
const editorImg = (page: Page) => page.locator('.ProseMirror .pm-image-wrap img')
const panel = (page: Page) => page.locator('[aria-label="Bildgröße"]')
const widthField = (page: Page) => page.getByLabel('Breite in Zentimetern')
const heightField = (page: Page) => page.getByLabel('Höhe in Zentimetern')
const lockCheckbox = (page: Page) => page.getByRole('checkbox', { name: 'Seitenverhältnis beibehalten' })
const imgStyle = (page: Page) => editorImg(page).evaluate((el) => ({ w: (el as HTMLElement).style.width, h: (el as HTMLElement).style.height }))

async function openWithImage(page: Page) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await page.locator('.ProseMirror').click()
  await page.keyboard.type('davor ')
  await page.locator('label:has-text("Bild")').locator('input[type=file]').setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG, 'base64'),
  })
  await expect(editorImg(page)).toHaveCount(1)
  await expect(panel(page)).toBeVisible() // image is selected right after insertion
}

test.describe('Bildgröße ändern', () => {
  test('a selected image shows the size panel and reveals resize handles', async ({ page }) => {
    await openWithImage(page)
    await expect(widthField(page)).toBeVisible()
    await expect(heightField(page)).toBeVisible()
    await expect(page.locator('.ProseMirror .pm-image-wrap.pm-image-selected')).toHaveCount(1)
    // handles appear once the image is large enough to place them (tiny images use the fields)
    await widthField(page).fill('5')
    await widthField(page).press('Enter')
    await expect(page.locator('.ProseMirror .pm-image-handle-se')).toBeVisible()
  })

  test('setting the width via the field resizes the image; height follows when locked', async ({ page }) => {
    await openWithImage(page)
    await widthField(page).fill('5')
    await widthField(page).press('Enter')
    // 5cm ≈ 189px; the tiny image is 1:1 so the height matches
    expect(await imgStyle(page)).toEqual({ w: '189px', h: '189px' })
  })

  test('with the ratio lock off, only the edited dimension changes', async ({ page }) => {
    await openWithImage(page)
    await widthField(page).fill('4')
    await widthField(page).press('Enter')
    await lockCheckbox(page).uncheck()
    await heightField(page).fill('2')
    await heightField(page).press('Enter')
    const s = await imgStyle(page)
    expect(s.w).toBe('151px') // 4cm, unchanged
    expect(s.h).toBe('76px') // 2cm
  })

  test('an invalid width (text/zero) is rejected without crashing or breaking the image', async ({ page }) => {
    await openWithImage(page)
    await widthField(page).fill('3')
    await widthField(page).press('Enter')
    const before = await imgStyle(page)
    await widthField(page).fill('0')
    await widthField(page).press('Enter')
    // 0 is invalid → the field reverts and the image keeps its last good size
    expect(await imgStyle(page)).toEqual(before)
    await expect(editorImg(page)).toHaveCount(1)
  })

  test('typing right after a field resize APPENDS text, it does not replace the image', async ({ page }) => {
    await openWithImage(page)
    await widthField(page).fill('4')
    await widthField(page).press('Enter')
    await page.locator('.ProseMirror').focus()
    await page.keyboard.type('danach')
    await expect(editorImg(page)).toHaveCount(1)
    await expect(page.locator('.ProseMirror')).toContainText('danach')
  })

  test('undo restores the previous size, redo re-applies it', async ({ page }) => {
    await openWithImage(page)
    await page.waitForTimeout(600) // make the resize its own history group (newGroupDelay)
    await widthField(page).fill('6')
    await widthField(page).press('Enter')
    await expect(editorImg(page)).toHaveCSS('width', '227px')
    await page.getByText('davor').click() // move focus into the editor (undo targets the doc)
    await page.keyboard.press('ControlOrMeta+z')
    await expect(editorImg(page)).not.toHaveCSS('width', '227px')
    await page.keyboard.press('ControlOrMeta+y')
    await expect(editorImg(page)).toHaveCSS('width', '227px')
  })

  test('"Auf Originalgröße zurücksetzen" restores the insert size', async ({ page }) => {
    await openWithImage(page)
    // the button is enabled once the intrinsic size is known (image load captured it)
    const resetBtn = page.getByRole('button', { name: 'Auf Originalgröße zurücksetzen' })
    await expect(resetBtn).toBeEnabled()
    await widthField(page).fill('7')
    await widthField(page).press('Enter')
    await expect(editorImg(page)).toHaveCSS('width', '265px')
    await resetBtn.click()
    // the 1x1 image's original is 1px → clamped to the 8px floor
    await expect(editorImg(page)).toHaveCSS('width', '8px')
  })

  test('an image can be selected without the mouse (keyboard) and then sized', async ({ page }) => {
    await openWithImage(page)
    // deselect by clicking into the text, then re-select the image via the keyboard
    await page.getByText('davor').click()
    await expect(panel(page)).toBeHidden()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowRight')
    await expect(panel(page)).toBeVisible()
    await widthField(page).fill('3')
    await widthField(page).press('Enter')
    expect((await imgStyle(page)).w).toBe('113px')
  })

  async function sizeTo5cm(page: Page) {
    await widthField(page).fill('5')
    await widthField(page).press('Enter')
    await expect(editorImg(page)).toHaveCSS('width', '189px')
  }
  const imgW = (page: Page) => editorImg(page).evaluate((el) => parseInt((el as HTMLElement).style.width, 10))
  const imgH = (page: Page) => editorImg(page).evaluate((el) => parseInt((el as HTMLElement).style.height, 10))
  async function dragHandle(page: Page, dir: string, dx: number, dy: number) {
    const box = (await page.locator(`.ProseMirror .pm-image-handle-${dir}`).boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 })
    await page.mouse.up()
  }

  test('dragging a corner handle resizes proportionally (width ≈ height for the 1:1 image)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'drag is a mouse/precision gesture; the guaranteed touch path (fields) is covered on all projects')
    await openWithImage(page)
    await sizeTo5cm(page)
    await dragHandle(page, 'se', 60, 60)
    const w = await imgW(page)
    expect(w).toBeGreaterThan(189)
    expect(Math.abs(w - (await imgH(page)))).toBeLessThanOrEqual(2) // stayed proportional
  })

  test('dragging an edge handle changes only that dimension', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'drag is a mouse/precision gesture; the guaranteed touch path (fields) is covered on all projects')
    await openWithImage(page)
    await sizeTo5cm(page)
    await dragHandle(page, 'e', 60, 0) // east/right edge → width only
    expect(await imgW(page)).toBeGreaterThan(189)
    expect(await imgH(page)).toBe(189) // height unchanged
  })

  test('a drag resizes by the same MODEL amount regardless of page zoom (§3.20)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'drag is a mouse/precision gesture; the guaranteed touch path (fields) is covered on all projects')
    await openWithImage(page)
    await page.getByRole('button', { name: '100%', exact: true }).click()
    await sizeTo5cm(page)
    // zoom out to 90%, then drag 45 *screen* px → 45/0.9 = 50 *model* px → width 189→239
    await page.getByRole('button', { name: 'Verkleinern' }).click()
    await expect(page.getByLabel('Zoomstufe')).toHaveText('90%')
    await dragHandle(page, 'e', 45, 0)
    expect(await imgW(page)).toBe(239)
  })

  test('only the selected image shows selection feedback when several images exist', async ({ page }) => {
    await openWithImage(page)
    await page.locator('.ProseMirror').press('End')
    await page.keyboard.type('mehr ')
    await page.locator('label:has-text("Bild")').locator('input[type=file]').setInputFiles({
      name: 'tiny2.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG, 'base64'),
    })
    await expect(page.locator('.ProseMirror .pm-image-wrap')).toHaveCount(2)
    // exactly one image carries the selection feedback (the just-inserted one)
    await expect(page.locator('.ProseMirror .pm-image-wrap.pm-image-selected')).toHaveCount(1)
  })

  test('round trip: a field-resized image exports its size to ODT (raw cm in content.xml)', async ({ page }) => {
    await openWithImage(page)
    await widthField(page).fill('8')
    await widthField(page).press('Enter')
    await expect(editorImg(page)).toHaveCSS('width', '302px') // 8cm
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const fs = await import('node:fs/promises')
    const zip = await JSZip.loadAsync(await fs.readFile((await (await downloadPromise).path())!))
    const xml = await zip.file('content.xml')!.async('text')
    // 302px ≈ 7.99cm; assert a draw:frame with an ~8cm svg:width, not the 6cm default
    expect(xml).toMatch(/<draw:frame[^>]*svg:width="7\.\d+cm"/)
  })

  test('an image inside a table cell can be resized like one in the body text (§2.11)', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
    await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
    await page.locator('.ProseMirror').click()
    await insertTableViaDialog(page, 2, 2)
    await page.locator('.ProseMirror td').first().click()
    await page.locator('label:has-text("Bild")').locator('input[type=file]').setInputFiles({
      name: 'cell.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG, 'base64'),
    })
    await expect(page.locator('.ProseMirror td .pm-image-wrap img')).toHaveCount(1)
    await page.keyboard.press('ArrowLeft') // node-select the just-inserted cell image
    await expect(panel(page)).toBeVisible()
    await widthField(page).fill('3')
    await widthField(page).press('Enter')
    await expect(page.locator('.ProseMirror td .pm-image-wrap img')).toHaveCSS('width', '113px')
  })

  test('a whole handle drag is a single undo step (§5.2.8)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'drag is a mouse/precision gesture; the guaranteed touch path (fields) is covered on all projects')
    await openWithImage(page)
    await sizeTo5cm(page)
    await page.waitForTimeout(600) // separate the size-to-5cm step from the drag
    await dragHandle(page, 'se', 60, 60)
    expect(await imgW(page)).toBeGreaterThan(189)
    await page.getByText('davor').click()
    await page.keyboard.press('ControlOrMeta+z') // one undo reverts the entire drag, not per pixel
    await expect(editorImg(page)).toHaveCSS('width', '189px')
  })

  test('resizing then clicking into text and typing keeps all content (§5.2.15)', async ({ page }) => {
    await openWithImage(page)
    await sizeTo5cm(page)
    await page.getByText('davor').click()
    await page.keyboard.type('X')
    await expect(editorImg(page)).toHaveCount(1)
    await expect(page.locator('.ProseMirror')).toContainText('davor')
    await expect(page.locator('.ProseMirror')).toContainText('X')
  })

  test('after distorting via an edge handle, a locked field resize keeps the distorted ratio (Grenzfall 19)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'uses a drag to distort; the field-ratio logic is viewport-independent')
    await openWithImage(page)
    await sizeTo5cm(page)
    await dragHandle(page, 'e', 189, 0) // widen only → width ≫ height (distorted, not 1:1)
    expect(await imgW(page)).toBeGreaterThan((await imgH(page)) + 20)
    // ratio lock is on by default → a width change follows the *current* (distorted) ratio
    await widthField(page).fill('5')
    await widthField(page).press('Enter')
    expect(await imgW(page)).toBe(189)
    expect(await imgH(page)).toBeLessThan(150) // NOT 189 → the 2:1-ish distortion was kept
  })

  test('the size fields mirror the live values during a handle drag (§1.6)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Desktop Chrome', 'drag is a mouse/precision gesture; the guaranteed touch path (fields) is covered on all projects')
    await openWithImage(page)
    await sizeTo5cm(page)
    await expect(widthField(page)).toHaveValue('5')
    const box = (await page.locator('.ProseMirror .pm-image-handle-se').boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 95, cy + 95, { steps: 6 })
    await expect(widthField(page)).not.toHaveValue('5') // field tracks the drag live
    await page.mouse.up()
  })
})
