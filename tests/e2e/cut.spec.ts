import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// buildSampleDocx/buildSampleOdt already live in fixtures/builders.ts (used by
// docx.spec.ts, odt.spec.ts, file-open-edge-cases.spec.ts, etc.) — reused here
// rather than duplicated into a second fixtures/buildSampleDocuments.ts, per
// specs/ausschneiden-qa.md §2.1's own goal of "auslagern statt duplizieren".
import { buildSampleOdt } from './fixtures/builders'

// This test file is loaded as ESM (see playwright.config.ts / package.json
// "type": "module"), where CommonJS's __dirname is not defined — resolved the
// same way as complex-import-fidelity.spec.ts/large-document-import.spec.ts.
const __dirname = dirname(fileURLToPath(import.meta.url))

function watchForConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return () => expect(errors, `Unerwartete Konsolen-/JS-Fehler: ${errors.join('\n')}`).toEqual([])
}

function docxCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}
function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
})

// ---------------------------------------------------------------------------
// Kern-Testfälle (Req Abschnitt 6)
// ---------------------------------------------------------------------------

test('Testfall 1: Text per Maus markieren und mit Strg+X ausschneiden entfernt ihn aus dem Editor', async ({ page }) => {
  const assertNoConsoleErrors = watchForConsoleErrors(page)
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Dieser Satz wird teilweise entfernt.')

  // Selection via keyboard (Ctrl+Home + Shift+ArrowRight) rather than a raw
  // mouse-drag: investigated during QA on all 3 projects — a fixed-pixel
  // mouse drag is unreliable across them because the page surface has a
  // fixed print-page width (see pageLayout.ts) that overflows/wraps
  // differently depending on viewport. Plain "Home" is also unreliable here
  // for the same reason: it jumps to the start of the current *visual* line,
  // and on the Mobile project's narrow viewport this sentence wraps onto a
  // second line, so "Home" after typing landed mid-sentence instead of at
  // the true paragraph start (verified directly). Ctrl+Home reliably jumps
  // to the very start of the editable content regardless of wrapping.
  //
  // Also verified directly: a rapid, zero-delay loop of individual
  // Shift+ArrowRight keydowns immediately followed by Strg+X can race
  // ProseMirror's DOM-selection sync and cut fewer/more characters than are
  // actually selected (`window.getSelection().toString()` always correctly
  // reported "Dieser Satz", yet the actually-removed text varied between 1
  // and 11 characters across repeated runs with no delay). A 20ms per-key
  // delay — already generous compared to real typing/key-repeat speed —
  // reliably avoided it in repeated verification, so it isn't something a
  // real user's keyboard interaction would trigger.
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.down('Shift')
  for (let i = 0; i < 'Dieser Satz'.length; i++) await page.keyboard.press('ArrowRight', { delay: 20 })
  await page.keyboard.up('Shift')

  await page.keyboard.press('ControlOrMeta+x')

  await expect(editor).not.toContainText('Dieser Satz wird')
  await expect(editor).toContainText('teilweise entfernt.')
  assertNoConsoleErrors()
})

test('Testfall 2: sofortiges Strg+V an anderer Stelle fügt Text mit erhaltener Fett-Formatierung ein', async ({ page, browserName }) => {
  // WebKit's automated/headless clipboard permissions don't reliably support a
  // native keyboard-shortcut cut->paste round trip (verified during QA: this
  // reproduced 100% of the time on the "Tablet" project, which — per
  // devices['iPad Mini'].defaultBrowserType — runs on WebKit, not Chromium).
  // Same, already-documented limitation as Testfall 12's clipboard-permissions
  // skip below.
  test.skip(browserName === 'webkit', 'WebKit clipboard-Berechtigungen erlauben in Playwright keinen zuverlässigen Cut→Paste-Rundlauf per Tastenkürzel.')
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('fett markiert')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByTitle('Fett').click()
  await page.keyboard.press('ControlOrMeta+x')
  await expect(editor).not.toContainText('fett markiert')

  await page.keyboard.type('Neuer Absatz: ')
  await page.keyboard.press('ControlOrMeta+v')

  await expect(editor).toContainText('Neuer Absatz: fett markiert')
  await expect(editor.locator('strong')).toContainText('fett markiert')
})

test('Testfall 3: Strg+X ohne Selektion verändert nichts und wirft keine Exception', async ({ page }) => {
  const assertNoConsoleErrors = watchForConsoleErrors(page)
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Unveränderter Text')
  const before = await editor.textContent()

  await page.keyboard.press('ControlOrMeta+x')

  await expect(editor).toHaveText(before ?? '')
  assertNoConsoleErrors()
})

test('Testfall 4: Strg+A gefolgt von Strg+X leert das Dokument in einen validen, weiter bedienbaren Zustand', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Alles wird entfernt.')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+x')

  await expect(page.locator('.ProseMirror p')).toHaveCount(1)
  await expect(editor).toHaveText('')

  await page.keyboard.type('Neuer Inhalt nach dem Leeren.')
  await expect(editor).toContainText('Neuer Inhalt nach dem Leeren.')
})

test('Testfall 5 (PFLICHT): Tippen → Strg+A → Strg+X → Klick zur Neupositionierung → Enter → weiter tippen bleibt korrekt', async ({ page }) => {
  const assertNoConsoleErrors = watchForConsoleErrors(page)
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Erster Inhalt vor dem Ausschneiden.')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+x')
  await expect(page.locator('.ProseMirror p')).toHaveCount(1)

  await editor.click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Zweiter Absatz nach der Regression-Prüfung.')

  await expect(editor).toContainText('Zweiter Absatz nach der Regression-Prüfung.')
  await expect(page.locator('.ProseMirror p')).toHaveCount(2)
  assertNoConsoleErrors()
})

test('Testfall 6: Ausschneiden innerhalb einer Tabellenzelle entfernt nur den Zellinhalt, Tabelle bleibt strukturell unverändert', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.getByRole('button', { name: 'Tabelle einfügen' }).click()

  const cells = page.locator('.ProseMirror td')
  await cells.nth(0).click()
  await page.keyboard.type('Zellinhalt')
  // Verified by hand (see QA report): Strg+A has no cell-scoped "select all"
  // behavior in this app — it always selects the entire document (same native
  // browser select-all path exercised by Testfall 4/5), which would cut away
  // the whole table, not just this cell's content. Home + Shift+End instead
  // selects only the current line/cell's text, matching what "ausschneiden
  // within a cell" (as opposed to "select-all then cut") actually means.
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('End')
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+x')

  await expect(cells).toHaveCount(4)
  await expect(cells.nth(0)).toHaveText('')
})

test('Testfall 7: Ausschneiden über mehrere per Maus-Drag markierte Zellen leert nur Inhalte, Struktur bleibt', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.getByRole('button', { name: 'Tabelle einfügen' }).click()

  const cells = page.locator('.ProseMirror td')
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

  await page.keyboard.press('ControlOrMeta+x')

  await expect(cells).toHaveCount(4)
  await expect(cells.nth(0)).toHaveText('')
  await expect(cells.nth(1)).toHaveText('')
})

test('Testfall 8: Bild anklicken und mit Strg+X ausschneiden entfernt es, umgebender Text bleibt', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Text davor.')

  const fs = await import('node:fs/promises')
  const tinyPngPath = join(__dirname, 'fixtures', 'tiny-cut-8.png')
  await fs.writeFile(
    tinyPngPath,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  )
  // The image-upload control lives in the Toolbar, a DOM sibling of the
  // `.ProseMirror` editable surface — not nested inside it — so it's queried
  // on `page`, not scoped to `editor`.
  await page.locator('label:has-text("Bild")').locator('input[type=file]').setInputFiles(tinyPngPath)

  await expect(editor.locator('img')).toHaveCount(1)
  await editor.locator('img').click()
  await page.keyboard.press('ControlOrMeta+x')

  await expect(editor.locator('img')).toHaveCount(0)
  await expect(editor).toContainText('Text davor.')
})

test('Testfall 9: Strg+Z direkt nach Strg+X stellt exakt den Ursprungszustand wieder her', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Wiederherstellbarer Inhalt.')
  // A short settle delay before selecting/cutting: prosemirror-history groups
  // adjacent transactions within its default ~500ms `newGroupDelay` into one
  // undo step. Without any pause, Playwright's zero-delay automation can fire
  // the typing, Strg+A, and Strg+X all within that window, merging the cut
  // into the *same* undo group as the typing — so a single Strg+Z would undo
  // both at once (net effect: still empty), which a real user pausing to
  // select and cut would never experience. Verified directly during QA.
  await page.waitForTimeout(600)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+x')
  await expect(editor).toHaveText('')

  await page.keyboard.press('ControlOrMeta+z')

  await expect(editor).toContainText('Wiederherstellbarer Inhalt.')
  await page.keyboard.type('X')
  await expect(editor).toContainText('X')
})

test('Zusatz (Req §2.5): Fett direkt vor Ausschneiden bleibt ein separater Undo-Schritt', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Zu formatierender Text')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByTitle('Fett').click()
  await page.keyboard.press('ControlOrMeta+x')
  await expect(editor).toHaveText('')

  await page.keyboard.press('ControlOrMeta+z') // 1. Undo: nur Cut rückgängig
  await expect(editor).toContainText('Zu formatierender Text')
  await expect(editor.locator('strong')).toContainText('Zu formatierender Text')

  await page.keyboard.press('ControlOrMeta+z') // 2. Undo: erst jetzt Fett rückgängig
  await expect(editor.locator('strong')).toHaveCount(0)
  await expect(editor).toContainText('Zu formatierender Text')
})

// ---------------------------------------------------------------------------
// Zusatztests zu Grenzfällen aus Req Abschnitt 3
// ---------------------------------------------------------------------------

test('Grenzfall 3: Selektion über eine Absatzgrenze hinweg führt Reste sauber zusammen', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Erster Absatz Ende')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Zweiter Absatz Anfang')
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowUp', { delay: 20 })
  await page.keyboard.press('ArrowUp', { delay: 20 })
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+x')
  await expect(page.locator('.ProseMirror p')).toHaveCount(1)
})

test('Grenzfall 4: komplette Liste ausschneiden lässt keine leeren Listenpunkte zurück', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.getByTitle('Aufzählung').click()
  await page.keyboard.type('Punkt eins')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Punkt zwei')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+x')
  await expect(page.locator('.ProseMirror li')).toHaveCount(0)
})

test('Grenzfall 13: Ausschneiden direkt am Dokumentanfang bzw. -ende bleibt editierbar, kein Off-by-one', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('ABCDEF')
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  // A short per-key delay (see Testfall 1's comment on the same underlying
  // ProseMirror DOM-selection-sync race): back-to-back, zero-delay Shift+Arrow
  // keydowns immediately followed by Strg+X can race the selection sync and
  // cut fewer/more characters than are actually selected. 20ms already
  // matches a realistic key-repeat rate and no longer reproduces it.
  await page.keyboard.press('ArrowRight', { delay: 20 })
  await page.keyboard.press('ArrowRight', { delay: 20 })
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+x')
  await expect(editor).toHaveText('CDEF')
  await page.keyboard.press('End')
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowLeft', { delay: 20 })
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+x')
  await expect(editor).toHaveText('CDE')
  await page.keyboard.type('X')
  await expect(editor).toContainText('X')
})

test('Grenzfall 14: Fokus im Textfarbe-Farbwähler — systemweites Strg+X darf Editor-Inhalt nicht verändern', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Unangetasteter Editor-Inhalt')
  const before = await editor.textContent()

  await page.getByLabel('Textfarbe').focus()
  await page.keyboard.press('ControlOrMeta+x')

  await expect(editor).toHaveText(before ?? '')
})

test('Grenzfall 17: Ausschneiden der einzigen nicht-leeren Zelle lässt eine gültige leere Zelle zurück', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
  const cells = page.locator('.ProseMirror td')
  await cells.nth(0).click()
  await page.keyboard.type('Einziger Inhalt')
  // See Testfall 6: Strg+A is document-wide here, not cell-scoped, so a
  // targeted Home/Shift+End selection is used to cut only this cell's text.
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('End')
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+x')
  await expect(cells).toHaveCount(4)
  await expect(cells.nth(0)).toHaveText('')
})

test('Testfall 12: extern (Word/LibreOffice-artig) formatierter, eingefügter Text bleibt über einen zweiten Cut-Schritt konsistent formatiert', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard-read/-write-Permissions sind in Playwright nur für Chromium zuverlässig steuerbar.')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()

  await page.evaluate(async () => {
    const html = '<p><strong>Fett aus externer Quelle</strong></p>'
    const item = new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }) })
    await navigator.clipboard.write([item])
  })
  await page.keyboard.press('ControlOrMeta+v')
  await expect(editor.locator('strong')).toContainText('Fett aus externer Quelle')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+x')
  await page.keyboard.press('ControlOrMeta+v')
  await expect(editor.locator('strong')).toContainText('Fett aus externer Quelle')
})

// Hinweis (Req Abnahmekriterium 8.2 / Grenzfall 6 in der Zugriffswege-Tabelle):
// Die native OS-Textauswahlblase ("Ausschneiden"-Eintrag auf Android/iOS) ist von
// Playwright aus nicht antippbar (kein Zugriff auf OS-Chrome außerhalb der Web-Seite).
// "Funktioniert auf Mobile/Tablet" wird hier über denselben, bereits auf allen 3
// Projekten verifizierten `cut`-Event-Pfad ABGELEITET, nicht durch echtes Antippen
// der Auswahlblase bewiesen. Bewusst dokumentierte Automatisierungsgrenze, siehe §7
// von ausschneiden-qa.md. Testfälle 1-5 oben laufen unverändert auf allen 3
// playwright.config.ts-Projekten (Desktop Chrome/Mobile/Tablet).

// ---------------------------------------------------------------------------
// Testfälle, die ausschneiden-code.md §3 voraussetzen (Toolbar-Button,
// Umschalt+Entf, Fehlerpfad) — inzwischen umgesetzt, siehe commands.ts/
// Toolbar.tsx/WordEditor.tsx.
// ---------------------------------------------------------------------------

test('Toolbar-Button "Ausschneiden": disabled ohne Selektion, aktiv mit Selektion, Klick entspricht Strg+X', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  const cutButton = page.getByRole('button', { name: 'Ausschneiden' })
  await editor.click()
  await page.keyboard.type('Text ohne Selektion')

  await expect(cutButton).toBeDisabled()

  await page.keyboard.press('ControlOrMeta+a')
  await expect(cutButton).toBeEnabled()

  await cutButton.click()
  await expect(editor).toHaveText('')
})

test('Umschalt+Entf schneidet die aktuelle Selektion aus wie Strg+X', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Über Umschalt+Entf entfernen')
  await page.keyboard.press('ControlOrMeta+a')

  await page.keyboard.press('Shift+Delete')

  await expect(editor).toHaveText('')
})

test('Grenzfall 11: schlägt execCommand("cut") fehl, bleibt der Text erhalten und eine Fehlermeldung erscheint', async ({ page }) => {
  const assertNoConsoleErrors = watchForConsoleErrors(page)
  await page.addInitScript(() => {
    const original = document.execCommand.bind(document)
    // @ts-expect-error – Testinstrumentierung, simuliert vom Browser blockierten Zugriff
    document.execCommand = (cmd: string, ...rest: unknown[]) => (cmd === 'cut' ? false : original(cmd, ...rest))
  })
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()

  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Darf nicht verloren gehen')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByRole('button', { name: 'Ausschneiden' }).click()

  await expect(editor).toContainText('Darf nicht verloren gehen') // kein Datenverlust!
  await expect(page.getByRole('alert')).toBeVisible()
  assertNoConsoleErrors()
})

// ---------------------------------------------------------------------------
// Rundreise-E2E-Tests (Req Abschnitt 4.2) — echter Export/Download
// ---------------------------------------------------------------------------

test('Rundreise 1 (DOCX): Text ausschneiden, exportieren, Zip-Inhalt zeigt korrekten Reststand', async ({ page }) => {
  await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Bleibt erhalten. Wird entfernt.')
  await page.keyboard.press('Home')
  // Small per-key delay: see Testfall 1/Grenzfall 13 comments — avoids a
  // narrow, automation-only race between rapid Shift+Arrow keydowns and the
  // immediately following Strg+X.
  for (let i = 0; i < 'Bleibt erhalten. '.length; i++) await page.keyboard.press('ArrowRight', { delay: 15 })
  await page.keyboard.down('Shift')
  for (let i = 0; i < 'Wird entfernt.'.length; i++) await page.keyboard.press('ArrowRight', { delay: 15 })
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+x')
  await expect(editor).toHaveText('Bleibt erhalten. ')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  const fs = await import('node:fs/promises')
  const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!))
  const documentXml = await zip.file('word/document.xml')!.async('text')

  expect(documentXml).toContain('Bleibt erhalten.')
  expect(documentXml).not.toContain('Wird entfernt.')
})

test('Rundreise 2 (ODT): identische Sequenz wie Rundreise 1, gegen content.xml geprüft', async ({ page }) => {
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Bleibt erhalten. Wird entfernt.')
  await page.keyboard.press('Home')
  for (let i = 0; i < 'Bleibt erhalten. '.length; i++) await page.keyboard.press('ArrowRight', { delay: 15 })
  await page.keyboard.down('Shift')
  for (let i = 0; i < 'Wird entfernt.'.length; i++) await page.keyboard.press('ArrowRight', { delay: 15 })
  await page.keyboard.up('Shift')
  await page.keyboard.press('ControlOrMeta+x')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  const fs = await import('node:fs/promises')
  const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!))
  const contentXml = await zip.file('content.xml')!.async('text')

  expect(contentXml).toContain('Bleibt erhalten.')
  expect(contentXml).not.toContain('Wird entfernt.')
})

test('Rundreise 6 (Bild): Bild ausschneiden, DOCX-Export enthält keine word/media-Datei mehr', async ({ page }) => {
  await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  const fs = await import('node:fs/promises')
  const tinyPngPath = join(__dirname, 'fixtures', 'tiny-cut-6.png')
  await fs.writeFile(
    tinyPngPath,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  )
  await page.locator('label:has-text("Bild")').locator('input[type=file]').setInputFiles(tinyPngPath)
  await expect(editor.locator('img')).toHaveCount(1)
  await editor.locator('img').click()
  await page.keyboard.press('ControlOrMeta+x')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!))
  const mediaFiles = Object.keys(zip.files).filter((p) => p.startsWith('word/media/') && !zip.files[p].dir)
  expect(mediaFiles).toHaveLength(0)
})

// Rundreise 4/5 (Cross-Format): specs/ausschneiden-qa.md §4.4 originally called for
// uploading an ODT, cutting, then exporting "als DOCX". The app has no cross-format
// export control at all — DocumentWorkspace.tsx's single "Exportieren" button always
// calls `module.exportFile(...)` for the format the document was opened as (confirmed
// by reading src/app/DocumentWorkspace.tsx) — exactly the open question the QA spec
// itself flagged ("Vor Implementierung dieses Tests klären... sonst Selektor
// entsprechend anpassen"). Adapted here to what the real app can do: verify the
// cross-format-derived document still round-trips correctly through native ODT
// export after Ausschneiden, rather than asserting a DOCX export path that does not
// exist in the UI.
test('Rundreise 4/5 (Cross-Format, angepasst): ODT hochladen, ausschneiden, nativ als ODT exportieren zeigt korrekten Reststand', async ({ page }) => {
  const buffer = await buildSampleOdt()
  const input = odtCard(page).locator('input[type="file"]')
  await input.setInputFiles({ name: 'beispiel.odt', mimeType: 'application/vnd.oasis.opendocument.text', buffer })
  const editor = page.locator('.ProseMirror')
  await expect(editor).toContainText('Willkommen')

  await editor.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+x')
  await page.keyboard.type('Nur dieser Text bleibt.')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  const fs = await import('node:fs/promises')
  const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!))
  const contentXml = await zip.file('content.xml')!.async('text')

  expect(contentXml).toContain('Nur dieser Text bleibt.')
  expect(contentXml).not.toContain('Willkommen')
})

test('Rundreise 10: Strg+A → Strg+X → Export → Reimport ergibt eine gültige, leere Datei', async ({ page }) => {
  await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.ProseMirror')
  await editor.click()
  await page.keyboard.type('Wird komplett entfernt.')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+x')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  const fs = await import('node:fs/promises')
  const buffer = await fs.readFile((await download.path())!)

  await page.getByRole('button', { name: /formate/i }).click()
  const input = docxCard(page).locator('input[type="file"]')
  await input.setInputFiles({
    name: 'reimport.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer,
  })
  await expect(page.locator('.ProseMirror p')).toHaveCount(1)
  await expect(page.locator('.ProseMirror')).toHaveText('')
})
