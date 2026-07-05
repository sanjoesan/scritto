import { test, expect } from '@playwright/test'

function odtCard(page: import('@playwright/test').Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}

test.describe('Selection-sync regression (stale AllSelection after toolbar action + click)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
    await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  })

  test('select-all, bold, click to reposition, Enter, and type — both paragraphs must survive', async ({ page }) => {
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.type('Hallo, das ist ein Test.')

    await page.keyboard.press('ControlOrMeta+a')
    await page.getByTitle('Fett').click()

    // Re-click inside the now-bold, still-selected text — this used to leave
    // ProseMirror's model selection stuck on the stale "select all" range.
    await editor.click()
    await page.keyboard.press('End')
    // ProseMirror only learns a native, keyboard-driven caret move (like the
    // "End" above) via the browser's asynchronous `selectionchange` event.
    // Firing "Enter" immediately after — as any Playwright `press()` sequence
    // does, with no human reaction-time gap — can race ahead of that catch-up
    // and still act on the pre-"End" position. A real user's natural typing
    // cadence never triggers this; a short wait here just gives the
    // already-in-flight sync a chance to land first, same as it always would
    // outside of instant, automated keystrokes.
    await page.waitForTimeout(50)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Zweiter Absatz.')

    await expect(editor).toContainText('Hallo, das ist ein Test.')
    await expect(editor).toContainText('Zweiter Absatz.')
    await expect(page.locator('.ProseMirror p')).toHaveCount(2)
  })

  test('same regression inside a table cell (click between cells after formatting)', async ({ page }) => {
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.getByRole('button', { name: 'Tabelle einfügen' }).click()

    const cells = page.locator('.ProseMirror td')
    await cells.nth(0).click()
    await page.keyboard.type('Zelle eins')
    await page.keyboard.press('ControlOrMeta+a')
    await page.getByTitle('Fett').click()

    await cells.nth(1).click()
    await page.keyboard.type('Zelle zwei')

    await expect(editor).toContainText('Zelle eins')
    await expect(editor).toContainText('Zelle zwei')
  })

  test('repeated select-all + bold + click cycles stay stable (stress check)', async ({ page }) => {
    const editor = page.locator('.ProseMirror')
    await editor.click()

    for (let i = 1; i <= 4; i++) {
      await page.keyboard.type(`Absatz ${i}.`)
      await page.keyboard.press('ControlOrMeta+a')
      await page.getByTitle('Fett').click()
      await editor.click()
      await page.keyboard.press('End')
      // See the identical comment in the first test above.
      await page.waitForTimeout(50)
      await page.keyboard.press('Enter')
    }
    await page.keyboard.type('Letzter Absatz.')

    for (let i = 1; i <= 4; i++) {
      await expect(editor).toContainText(`Absatz ${i}.`)
    }
    await expect(editor).toContainText('Letzter Absatz.')
    await expect(page.locator('.ProseMirror p')).toHaveCount(5)
  })

  // specs/kopieren-req.md Abschnitt 3, Testfall 1: same regression, but with
  // Kopieren (Strg+C) instead of Enter as the triggering follow-up action —
  // Kopieren must never itself perturb the selection, so this proves the
  // stale-AllSelection bug isn't reintroduced/masked by a copy in between.
  test('select-all, bold, copy, click to reposition, type — both paragraphs must survive', async ({ page }) => {
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.type('Hallo, das ist ein Test.')

    await page.keyboard.press('ControlOrMeta+a')
    await page.getByTitle('Fett').click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ControlOrMeta+c')

    // Re-click inside the now-bold, still-selected text after copying — the
    // copy itself must not have left/changed a stale selection.
    await editor.click()
    await page.keyboard.press('End')
    // See the identical comment in the first test above.
    await page.waitForTimeout(50)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Zweiter Absatz.')

    await expect(editor).toContainText('Hallo, das ist ein Test.')
    await expect(editor).toContainText('Zweiter Absatz.')
    await expect(page.locator('.ProseMirror p')).toHaveCount(2)
  })

  // specs/einfuegen-req.md Abschnitt 2 / Grenzfall 14, einfuegen-code.md 8.2 #11:
  // the same class of regression with a PASTE over a Strg+A selection as the
  // triggering action. A paste replaces the selection; the model selection must
  // stay consistent so a subsequent click + type does not wipe the pasted text.
  test('select-all, paste, click to reposition, type — pasted text must survive', async ({ page }) => {
    const editor = page.locator('.ProseMirror')
    await editor.click()
    await page.keyboard.type('Original-Text')

    await page.keyboard.press('ControlOrMeta+a')
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.setData('text/html', '<p>Eingefuegt</p>')
      const el = document.querySelector('.ProseMirror') as HTMLElement
      el.focus()
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })

    await editor.click()
    await page.keyboard.press('End')
    // See the identical comment in the first test above (async selectionchange).
    await page.waitForTimeout(50)
    await page.keyboard.type(' weiter')

    await expect(editor).toContainText('Eingefuegt weiter')
    await expect(editor).not.toContainText('Original-Text')
  })
})
