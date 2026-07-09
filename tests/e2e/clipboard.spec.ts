import { test, expect, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { insertTableViaDialog } from './fixtures/table-helpers'

// ESM module, no CommonJS __dirname — same workaround as the other e2e specs
// that read local fixture files (large-document-import.spec.ts, cut.spec.ts, ...).
const __dirname = dirname(fileURLToPath(import.meta.url))

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}

function watchForConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return () => expect(errors, `Unerwartete Konsolen-/JS-Fehler: ${errors.join('\n')}`).toEqual([])
}

// ProseMirror only learns a native, keyboard-driven caret/selection move (Home/End/
// Ctrl+Home/...) via the browser's asynchronous `selectionchange` event. Firing the
// next keystroke immediately after — as any zero-delay Playwright `press()` sequence
// does — can race ahead of that catch-up and still act on the pre-move
// selection/position. Identical, already-documented race in
// tests/e2e/selection-regression.spec.ts and tests/e2e/cut.spec.ts; a real user's
// natural reaction time never triggers it. This just gives the in-flight sync a
// chance to land before the next action.
async function settle(page: Page) {
  await page.waitForTimeout(50)
}

/** Sets an `<input type="color">`'s value the way a real user's color pick does,
 * so React's controlled-input value tracker actually observes the change (a plain
 * `el.value = x` followed by dispatching `input`/`change` is invisible to React,
 * because React's own value tracker intercepts the property setter and would
 * otherwise think nothing changed). */
async function pickColor(page: Page, label: string, hex: string) {
  const input = page.getByLabel(label)
  await input.evaluate((el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, hex)
}

test.beforeEach(async ({ page, context, browserName }) => {
  // Playwright's `context.grantPermissions(['clipboard-read', 'clipboard-write'])`
  // is CDP-based and only works reliably on Chromium — see
  // specs/kopieren-code.md Entscheidung 2.2. Firefox/WebKit are still exercised
  // below via a plain in-page keyboard round trip (select -> Ctrl/Cmd+C ->
  // click elsewhere -> Ctrl/Cmd+V), which uses the real OS clipboard through
  // native browser key handling and needs no permission grant at all.
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  }
  // Several tests below navigate back to the format picker after editing (to
  // paste into a fresh, empty document) while the source document is "dirty" —
  // DocumentWorkspace.tsx's handleClose() then shows a native
  // window.confirm(...). Auto-accepting it mirrors a real user confirming they
  // want to leave without exporting; it does nothing on tests that never
  // trigger it.
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
})

// ---------------------------------------------------------------------------
// Abschnitt 1 (Bedienelemente) / Abschnitt 7 (Testplan)
// ---------------------------------------------------------------------------

// WebKit's automated/headless clipboard permissions don't reliably support a
// native keyboard-shortcut copy->paste round trip in Playwright (same,
// already-documented limitation as tests/e2e/cut.spec.ts's Testfall 2/12 —
// reproduced there 100% of the time on the "Tablet" project, which — per
// devices['iPad Mini'].defaultBrowserType — runs on WebKit, not Chromium).
// Every test below that verifies a copy via an actual paste-back is skipped
// on WebKit for that reason; tests that don't need a paste (context menu,
// undo-neutrality, focus isolation) are unaffected and still run there.
const SKIP_WEBKIT_ROUNDTRIP = 'WebKit clipboard-Berechtigungen erlauben in Playwright keinen zuverlässigen Kopieren→Einfügen-Rundlauf per Tastenkürzel.'

test('Testfall 1: Strg/Cmd+C bei vorhandener Selektion legt den Inhalt in die Zwischenablage (Rundlauf via Einfügen)', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const assertNoConsoleErrors = watchForConsoleErrors(page)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Kopierbarer Inhalt.')
  await page.keyboard.press('ControlOrMeta+a')

  await page.keyboard.press('ControlOrMeta+c')
  // The document must be completely unchanged by a copy.
  await expect(editor).toHaveText('Kopierbarer Inhalt.')

  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.type(' ')
  await page.keyboard.press('ControlOrMeta+v')

  await expect(editor).toContainText('Kopierbarer Inhalt. Kopierbarer Inhalt.')
  assertNoConsoleErrors()
})

test('Testfall 2 / Grenzfall 1: Strg+C ohne Selektion lässt den bisherigen Zwischenablageninhalt unangetastet', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Text A')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')

  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.type(' Text B')
  // Collapse the selection to a plain cursor (no selection) before copying again.
  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.press('ControlOrMeta+c')

  await page.keyboard.type(' -> ')
  await page.keyboard.press('ControlOrMeta+v')

  // If the empty-selection Ctrl+C had (incorrectly) overwritten the clipboard
  // with nothing / the current line, the paste below would not reproduce "Text A".
  await expect(editor).toContainText('-> Text A')
})

test('Testfall 3/4, Grenzfall 13: natives Kontextmenü wird von keinem App-Handler unterdrückt', async ({ page }) => {
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Text für Kontextmenü-Test')

  const prevented = await editor.evaluate((el) => {
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    return ev.defaultPrevented
  })

  expect(prevented).toBe(false)
})

// ---------------------------------------------------------------------------
// Abschnitt 2.2 (Formatierte Inhalte)
// ---------------------------------------------------------------------------

test('Testfall (2.2/2): Fett + Farbe + Hervorhebung kombiniert bleiben nach Kopieren/Einfügen erhalten', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Mehrfachformatiert')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByTitle('Fett').click()
  await pickColor(page, 'Textfarbe', '#ff0000')
  await pickColor(page, 'Hervorhebungsfarbe', '#00ff00')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+v')

  const pastedRun = editor.locator('p').last().locator('strong span span')
  await expect(pastedRun).toHaveCount(1)
  await expect(pastedRun).toContainText('Mehrfachformatiert')
})

test('Testfall (2.2/4): Überschrift + Absatz + Liste bleiben nach Kopieren/Einfügen als unterschiedliche Blocktypen erkennbar', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.getByLabel('Absatzformat').selectOption('2')
  await page.keyboard.type('Überschrift')
  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.press('Enter')
  await page.getByLabel('Absatzformat').selectOption('normal')
  await page.keyboard.type('Normaler Absatz')
  await page.keyboard.press('Enter')
  await page.getByTitle('Aufzählung').click()
  await page.keyboard.type('Listenpunkt')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')
  // Paste into a brand-new document so the assertions below only see the pasted copy.
  await page.getByRole('button', { name: /formate/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const pastedEditor = page.locator('.ProseMirror')
  await pastedEditor.click()
  await page.keyboard.press('ControlOrMeta+v')

  await expect(pastedEditor.locator('h2')).toContainText('Überschrift')
  // `> p` (direct child) rather than `p`: a list item's own paragraph
  // (`<li><p>Listenpunkt</p></li>`) also matches a plain `p` selector, which
  // would make this locator ambiguous (Playwright's strict mode rejects a
  // locator resolving to more than one element).
  await expect(pastedEditor.locator('> p')).toContainText('Normaler Absatz')
  await expect(pastedEditor.locator('li')).toContainText('Listenpunkt')
})

// ---------------------------------------------------------------------------
// Abschnitt 3 (Zusammenspiel mit anderen Funktionen)
// ---------------------------------------------------------------------------

test('Testfall (3/2), Entscheidung 2.3: Kopieren ganzer Tabellenzellen erzeugt beim Einfügen eine Tabellenstruktur', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await insertTableViaDialog(page, 2, 2)
  const cells = editor.locator('td')
  await cells.nth(0).click()
  await page.keyboard.type('A')
  await cells.nth(1).click()
  await page.keyboard.type('B')

  const boxA = await cells.nth(0).boundingBox()
  const boxB = await cells.nth(1).boundingBox()
  await page.mouse.move(boxA!.x + boxA!.width / 2, boxA!.y + boxA!.height / 2)
  await page.mouse.down()
  await page.mouse.move(boxB!.x + boxB!.width / 2, boxB!.y + boxB!.height / 2, { steps: 5 })
  await page.mouse.up()

  await page.keyboard.press('ControlOrMeta+c')
  // Paste into a brand-new, table-less document: pasting a cell-range Slice
  // *inside* the source table's own cell would ask ProseMirror to close the
  // open row-run against the nearest enclosing `table` ancestor — which is
  // that very same table, growing it in place rather than creating a second,
  // separate one. A fresh document has no such ancestor, so the only valid
  // way to close the open ends is to wrap them in a brand-new `table` node,
  // which is the actual "does copying whole cells preserve table structure"
  // question this test is after.
  await page.getByRole('button', { name: /formate/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const pastedEditor = page.locator('.ProseMirror')
  await pastedEditor.click()
  await page.keyboard.press('ControlOrMeta+v')

  await expect(pastedEditor.locator('table')).toHaveCount(1)
  await expect(pastedEditor.locator('td').nth(0)).toContainText('A')
  await expect(pastedEditor.locator('td').nth(1)).toContainText('B')
})

test('Testfall (3/2), Entscheidung 2.3 Gegenprobe: reine Textauswahl innerhalb einer Zelle erzeugt beim Einfügen KEINE neue Tabelle', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await insertTableViaDialog(page, 2, 2)
  const cells = editor.locator('td')
  await cells.nth(0).click()
  await page.keyboard.type('Nur Text')
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('End')
  await page.keyboard.up('Shift')

  await page.keyboard.press('ControlOrMeta+c')
  await cells.nth(3).click()
  await page.keyboard.press('ControlOrMeta+v')

  await expect(editor.locator('table')).toHaveCount(1)
  await expect(cells.nth(3)).toContainText('Nur Text')
})

test('Grenzfall 6: allein markiertes Bild kopieren nimmt keinen umgebenden Text mit', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Text davor.')

  const fs = await import('node:fs/promises')
  const tinyPngPath = join(__dirname, 'fixtures', 'tiny-copy-6.png')
  await fs.writeFile(
    tinyPngPath,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  )
  // The image-upload control lives in the Toolbar, a DOM sibling of `.ProseMirror`.
  await page.locator('label:has-text("Bild")').locator('input[type=file]').setInputFiles(tinyPngPath)
  // FileReader.readAsDataURL is async — wait for the resulting insertImage()
  // transaction to actually land before doing anything else (same pattern as
  // tests/e2e/cut.spec.ts's Testfall 8), rather than racing it with more typing.
  await expect(editor.locator('img')).toHaveCount(1)
  // insertImage()'s `replaceSelectionWith` leaves a NodeSelection *on* the
  // just-inserted image — typing immediately would replace the image itself
  // (a NodeSelection's node gets replaced by typed text) instead of inserting
  // after it. Move the selection past the image first.
  await page.keyboard.press('ControlOrMeta+End')
  await settle(page)
  await page.keyboard.type('Text danach.')

  // Select the image via keyboard rather than a mouse click: the fixture is a
  // real but visually tiny (1x1px, no width/height attrs) unstyled `<img>`,
  // whose hit-testing box the following paragraph can end up overlapping —
  // a rendering quirk of an unsized test image, unrelated to copy/paste, that
  // makes a coordinate-based click unreliable here. `Home` moves the cursor to
  // the start of the "Text danach." paragraph (right after the image);
  // `ArrowLeft` from there is prosemirror-commands' built-in
  // `selectNodeBackward` (part of `baseKeymap`), which selects the preceding
  // image as a NodeSelection — the exact same kind of selection a real click
  // on the image would have produced.
  await page.keyboard.press('Home')
  await settle(page)
  await page.keyboard.press('ArrowLeft')
  await settle(page)
  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('ControlOrMeta+End')
  await settle(page)
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+v')

  await expect(editor.locator('img')).toHaveCount(2)
  await expect(editor).toContainText('Text davor.')
  await expect(editor).toContainText('Text danach.')
})

test('Testfall (3/3): Kopieren erzeugt keinen eigenen Undo-Schritt', async ({ page }) => {
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Ursprünglicher Inhalt.')
  // See cut.spec.ts's identical comment: prosemirror-history groups adjacent
  // transactions within ~500ms into one undo step; a short settle avoids the
  // typing and the following actions merging into a single undo group.
  await page.waitForTimeout(600)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.type(' Zusatz.')

  await page.keyboard.press('ControlOrMeta+z')

  // Undo must revert the just-typed " Zusatz." (the last real content change),
  // not "undo the copy" (which isn't a transaction at all).
  await expect(editor).toHaveText('Ursprünglicher Inhalt.')
})

test('Grenzfall 12: wiederholtes Kopieren wechselnder Selektionen — jeweils letzter Kopiervorgang gewinnt', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Eins Zwei Drei')

  // Select "Eins", copy, then select "Drei", copy again — the second copy
  // must win, with no mixing of the two selections.
  await page.keyboard.press('ControlOrMeta+Home')
  await settle(page)
  await page.keyboard.down('Shift')
  for (let i = 0; i < 'Eins'.length; i++) await page.keyboard.press('ArrowRight', { delay: 20 })
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+c')

  await page.keyboard.press('ControlOrMeta+End')
  await settle(page)
  await page.keyboard.down('Shift')
  for (let i = 0; i < 'Drei'.length; i++) await page.keyboard.press('ArrowLeft', { delay: 20 })
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+c')

  await page.keyboard.press('ControlOrMeta+End')
  await settle(page)
  await page.keyboard.type(' -> ')
  await page.keyboard.press('ControlOrMeta+v')

  await expect(editor).toContainText('Eins Zwei Drei -> Drei')
})

test('Grenzfall (Fokus-Isolation): Strg+C bei fokussiertem Textfarbe-Farbwähler wirft keine Exception und ändert die Zwischenablage nicht sichtbar', async ({ page }) => {
  const assertNoConsoleErrors = watchForConsoleErrors(page)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Unbeteiligter Editor-Inhalt')
  const before = await editor.textContent()

  await page.getByLabel('Textfarbe').focus()
  await page.keyboard.press('ControlOrMeta+c')

  await expect(editor).toHaveText(before ?? '')
  assertNoConsoleErrors()
})

// ---------------------------------------------------------------------------
// Abschnitt 6, Zeile 6 (text/plain für Tabellen/Listen)
// ---------------------------------------------------------------------------

test('Abschnitt 6/6: Tabelle als text/plain eingefügt zeigt Tab-getrennte Zellen statt einer flachen Absatzkette', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'navigator.clipboard.readText aus page.evaluate ist nur unter Chromium zuverlässig steuerbar (Entscheidung 2.2).')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await insertTableViaDialog(page, 2, 2)
  const cells = editor.locator('td')
  await cells.nth(0).click()
  await page.keyboard.type('A1')
  await cells.nth(1).click()
  await page.keyboard.type('B1')

  const boxA = await cells.nth(0).boundingBox()
  const boxB = await cells.nth(1).boundingBox()
  await page.mouse.move(boxA!.x + boxA!.width / 2, boxA!.y + boxA!.height / 2)
  await page.mouse.down()
  await page.mouse.move(boxB!.x + boxB!.width / 2, boxB!.y + boxB!.height / 2, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.press('ControlOrMeta+c')

  const plainText = await page.evaluate(() => navigator.clipboard.readText())
  expect(plainText).toContain('A1\tB1')
})

test('T-14a: Tabelle als text/plain in ein unabhängiges natives <textarea> eingefügt zeigt Tab-/Zeilenstruktur', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  // A plain native <textarea>, injected once via page.evaluate purely as an
  // independent plain-text *target* to paste into (not to simulate the copy
  // itself — the copy is still a real ControlOrMeta+c on the real editor).
  await page.evaluate(() => {
    const el = document.createElement('textarea')
    el.id = 'e2e-plaintext-target-table'
    document.body.appendChild(el)
  })
  const target = page.locator('#e2e-plaintext-target-table')

  const editor = page.locator('.ProseMirror')
  await editor.click()
  await insertTableViaDialog(page, 2, 2)
  const cells = editor.locator('td')
  await cells.nth(0).click()
  await page.keyboard.type('A1')
  await cells.nth(1).click()
  await page.keyboard.type('B1')
  await cells.nth(2).click()
  await page.keyboard.type('A2')
  await cells.nth(3).click()
  await page.keyboard.type('B2')
  const boxA = await cells.nth(0).boundingBox()
  const boxD = await cells.nth(3).boundingBox()
  await page.mouse.move(boxA!.x + boxA!.width / 2, boxA!.y + boxA!.height / 2)
  await page.mouse.down()
  await page.mouse.move(boxD!.x + boxD!.width / 2, boxD!.y + boxD!.height / 2, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.press('ControlOrMeta+c')
  await target.focus()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(target).toHaveValue('A1\tB1\nA2\tB2')
})

test('T-14b: Liste als text/plain in ein unabhängiges natives <textarea> eingefügt zeigt "- "-Marker statt Absatzkette', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  await page.evaluate(() => {
    const el = document.createElement('textarea')
    el.id = 'e2e-plaintext-target-list'
    document.body.appendChild(el)
  })
  const target = page.locator('#e2e-plaintext-target-list')

  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.getByTitle('Aufzählung').click()
  await page.keyboard.type('Eins')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Zwei')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')
  await target.focus()
  await page.keyboard.press('ControlOrMeta+v')
  await expect(target).toHaveValue('- Eins\n- Zwei')
})

test('T-15 (nur Desktop Chrome): navigator.clipboard.read() nach Kopieren mit Formatierung enthält sowohl text/html als auch text/plain', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'clipboard.read() ist Chromium-spezifisch (Technik B, Entscheidung 2.2).')
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Formatierter Inhalt')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByTitle('Fett').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')

  const types = await page.evaluate(async () => {
    const items = await navigator.clipboard.read()
    return items.flatMap((item) => item.types)
  })
  expect(types).toContain('text/html')
  expect(types).toContain('text/plain')
})

test('T-5: Teilselektion, die exakt an der Fett/Nicht-Fett-Grenze eines Wortes beginnt (zweite Hälfte), bleibt beim Kopieren korrekt unformatiert', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('fett')
  // Bold only the first half ("fe"), leaving "tt" as the plain second half —
  // the same partially-bold-word shape as kopieren-req.md Abschnitt 2.2,
  // Testfall 3 / the DOCX round-trip regression test in roundtrip.test.ts.
  await page.keyboard.press('Home')
  await settle(page)
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowRight', { delay: 20 })
  await page.keyboard.press('ArrowRight', { delay: 20 })
  await page.keyboard.up('Shift')
  await settle(page)
  await page.getByTitle('Fett').click()
  await settle(page)

  // Now select just the second half ("tt") from behind via Shift+ArrowLeft,
  // exactly at the bold/non-bold boundary — no off-by-one slip allowed.
  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowLeft', { delay: 20 })
  await page.keyboard.press('ArrowLeft', { delay: 20 })
  await page.keyboard.up('Shift')
  await settle(page)
  await page.keyboard.press('ControlOrMeta+c')

  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+v')

  const lastParagraph = editor.locator('p').last()
  await expect(lastParagraph).toHaveText('tt')
  await expect(lastParagraph.locator('strong')).toHaveCount(0)
})

test('T-12: Strg+C bei fokussiertem Datei-Eingabefeld (verstecktes input[type=file]) wirft keine Exception und legt keinen Editor-Inhalt in einem unabhängigen Klartextziel ab', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  const marker = 'Geheimer-Editor-Inhalt-T12'
  await page.keyboard.type(marker)

  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))

  const fileInput = page.locator('label:has-text("Bild")').locator('input[type=file]')
  await fileInput.focus()
  await page.keyboard.press('ControlOrMeta+c')

  expect(errors, `Unerwartete JS-Exception: ${errors.join('\n')}`).toEqual([])

  // Independent plain-text target: paste whatever the above Ctrl+C put (or
  // didn't put) into the clipboard here, and confirm the editor's marker text
  // did not leak into it.
  await page.evaluate(() => {
    const el = document.createElement('textarea')
    el.id = 'e2e-focus-isolation-target'
    document.body.appendChild(el)
  })
  const target = page.locator('#e2e-focus-isolation-target')
  await target.focus()
  await page.keyboard.press('ControlOrMeta+v')

  const targetValue = await target.inputValue()
  expect(targetValue).not.toContain(marker)
  // The editor itself must also remain untouched by this whole sequence.
  await expect(editor).toHaveText(marker)
})

test('Grenzfall 7 (Zeitbudget-Näherung): Kopieren einer Selektion mit einem großen eingebetteten Bild friert die UI nicht spürbar ein', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  // kopieren-qa.md Abschnitt 3, Prüfung 5: ersetzt die manuelle Beobachtung
  // nicht vollständig, ergänzt sie aber um einen harten, automatisierten
  // Zeitbudget-Assert. ~3 MB base64 payload — big enough to make an O(n²) or
  // otherwise pathological clipboard-serialization path show up as a real
  // multi-second stall, without making the test itself slow to run.
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Text davor.')

  const fs = await import('node:fs/promises')
  const largeImagePath = join(__dirname, 'fixtures', 'large-copy-perf.png')
  // Not a real, decodable PNG — irrelevant here: FileReader.readAsDataURL()
  // and insertImage() never validate/decode pixel data, only wrap whatever
  // bytes are given into a data: URL (see Toolbar.tsx handleImagePick), so a
  // large opaque buffer exercises the same code path as a genuine multi-MB
  // photo would for the purpose of this timing check.
  const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex')
  const largeBuffer = Buffer.concat([pngHeader, Buffer.alloc(3 * 1024 * 1024, 0x42)])
  await fs.writeFile(largeImagePath, largeBuffer)
  await page.locator('label:has-text("Bild")').locator('input[type=file]').setInputFiles(largeImagePath)
  await expect(editor.locator('img')).toHaveCount(1)

  await page.keyboard.press('ControlOrMeta+End')
  await settle(page)
  await page.keyboard.type('Text danach.')
  await page.keyboard.press('ControlOrMeta+a')

  const start = Date.now()
  await page.keyboard.press('ControlOrMeta+c')
  // A trivial follow-up action must still respond promptly — this is the
  // actual "UI ist nicht eingefroren" signal, not just the raw key-press
  // return time (which Playwright could report as instant even mid-freeze).
  await page.keyboard.press('End')
  const elapsedMs = Date.now() - start

  expect(elapsedMs).toBeLessThan(5000)
})

// ---------------------------------------------------------------------------
// Tablet (Abschnitt 1, Testfall 5) — dokumentierte Automatisierungsgrenze wie
// bei tests/e2e/cut.spec.ts: das native mobile Auswahl-Kontextmenü selbst ist
// von Playwright aus nicht antippbar; dieser Test deckt nur die
// Tastatur-/Zwischenablage-Mechanik unter Touch-Emulation ab.
// ---------------------------------------------------------------------------

test('Tablet-Viewport: Selektion + Strg/Cmd+C/V funktioniert unter Touch-Emulation', async ({ page, isMobile, browserName }) => {
  test.skip(!isMobile, 'Nur relevant für die Tablet/Mobile-Projekte.')
  // The "Tablet" project (devices['iPad Mini']) runs on WebKit, where this
  // round trip is unreliable in Playwright (see SKIP_WEBKIT_ROUNDTRIP above);
  // touch-viewport coverage for the round trip itself still comes from the
  // "Mobile" project (devices['Pixel 7'], Chromium, also `isMobile: true`).
  test.skip(browserName === 'webkit', SKIP_WEBKIT_ROUNDTRIP)
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Touch-Inhalt')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+c')
  await page.keyboard.press('End')
  await settle(page)
  await page.keyboard.type(' ')
  await page.keyboard.press('ControlOrMeta+v')

  await expect(editor).toContainText('Touch-Inhalt Touch-Inhalt')
})
