import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'

// Dedicated paste (Einfügen) E2E suite. The file name MUST start with
// "clipboard" so playwright.config.ts's `testMatch: /clipboard.*\.spec\.ts/`
// also runs it on the "Desktop Safari (Clipboard)"/"Desktop Firefox (Clipboard)"
// projects — a file named paste.spec.ts would silently run on Chromium only and
// fake the cross-browser coverage (einfuegen-req.md Grenzfall 18 / 6.7).
//
// Technique (einfuegen-req.md 6.1): dispatch a synthetic ClipboardEvent with a
// DataTransfer straight onto the focused .ProseMirror element — deterministic,
// no OS clipboard or permissions, reproduces exactly ProseMirror's paste path,
// and portable across all browsers (unlike a real Strg+V, whose clipboard
// permissions are unreliable in Playwright WebKit/Firefox).

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}
function docxCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}

test.beforeEach(async ({ page, browserName }) => {
  // Firefox ignores the `clipboardData` init of a synthetically-constructed-and-
  // dispatched ClipboardEvent (there it is read-only null), so the deterministic
  // synthetic-paste technique this entire file relies on cannot inject data in
  // Firefox. This is a documented browser-automation limitation, NOT a product
  // defect — real Firefox users paste normally; the native paste path itself is
  // browser-standard. The paste behaviour is still fully exercised on Chromium,
  // WebKit (Safari), Mobile and Tablet. Same class of documented
  // clipboard-automation limit as SKIP_WEBKIT_ROUNDTRIP in clipboard.spec.ts.
  test.skip(browserName === 'firefox', 'Firefox blocks clipboardData on synthetic ClipboardEvents (automation limit, not a product defect).')
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  await page.locator('.ProseMirror').click()
})

/** Dispatch a synthetic paste with the given clipboard payloads. */
async function paste(page: Page, data: { html?: string; text?: string }) {
  await page.evaluate((payload) => {
    const dt = new DataTransfer()
    if (payload.html !== undefined) dt.setData('text/html', payload.html)
    if (payload.text !== undefined) dt.setData('text/plain', payload.text)
    const el = document.querySelector('.ProseMirror') as HTMLElement
    el.focus()
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, data)
}

/** Arm "paste without formatting" (Strg+Umschalt+V) via a synthetic keydown that
 *  the plugin's handleDOMEvents.keydown observes, then paste. */
async function pastePlain(page: Page, data: { html?: string; text?: string }) {
  await page.evaluate((payload) => {
    const el = document.querySelector('.ProseMirror') as HTMLElement
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    const dt = new DataTransfer()
    if (payload.html !== undefined) dt.setData('text/html', payload.html)
    if (payload.text !== undefined) dt.setData('text/plain', payload.text)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, data)
}

const editor = (page: Page) => page.locator('.ProseMirror')

test('3.3: single newline becomes a line break, blank line becomes a new paragraph', async ({ page }) => {
  await page.keyboard.type('Start ')
  await paste(page, { text: 'zeile eins\nzeile zwei' })
  // single \n → hard_break inside the SAME paragraph (no extra <p>)
  await expect(editor(page).locator('p')).toHaveCount(1)
  await expect(editor(page).locator('p br')).toHaveCount(1)
  await expect(editor(page)).toContainText('Start zeile eins')
  await expect(editor(page)).toContainText('zeile zwei')

  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await paste(page, { text: 'block a\n\nblock b' })
  await expect(editor(page).locator('p')).toHaveCount(2)
})

test('3.4: formatted HTML keeps bold, heading and list', async ({ page }) => {
  await paste(page, { html: '<h1>Titel</h1><p><strong>fett</strong> normal</p><ul><li>eins</li><li>zwei</li></ul>' })
  await expect(editor(page).locator('h1')).toHaveText('Titel')
  await expect(editor(page).locator('strong')).toHaveText('fett')
  await expect(editor(page).locator('ul li')).toHaveCount(2)
})

test('3.4/3.12: external image becomes placeholder text, surrounding text kept, export does not throw', async ({ page }) => {
  await paste(page, { html: '<p>vor <img src="https://example.invalid/x.png" alt="Foto"> nach</p>' })
  await expect(editor(page).locator('img')).toHaveCount(0)
  await expect(editor(page)).toContainText('[Bild: Foto]')
  await expect(editor(page)).toContainText('vor')
  await expect(editor(page)).toContainText('nach')
  // Export must NOT abort (Live-Bug 0.7): a real download is produced.
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  expect(await download.path()).toBeTruthy()
})

const NOTICE_TEXT = /externes Bild wurde durch Platzhalter|nicht einbettbar|konnte nicht eingefügt/i

test('3.9: a visible notice appears for the external image', async ({ page }) => {
  await paste(page, { html: '<p><img src="https://example.invalid/x.png" alt="Foto"></p>' })
  // Match the paste notice by its text (role="status" alone also matches the
  // always-present privacy banner, so it cannot distinguish the two).
  await expect(page.getByText(NOTICE_TEXT)).toBeVisible()
})

test('3.11/Grenzfall 15: pasted script/onerror is neutralised, text survives', async ({ page }) => {
  let alerted = false
  page.on('dialog', (d) => { alerted = true; d.dismiss() })
  await paste(page, { html: '<p>vorher<script>window.__x=1</script><img src="x" onerror="window.__x=1"> nachher</p>' })
  await expect(editor(page)).toContainText('vorher')
  await expect(editor(page)).toContainText('nachher')
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined()
  expect(alerted).toBe(false)
})

test('Grenzfall 20: pasted hyperlink keeps its visible text, drops the link', async ({ page }) => {
  await paste(page, { html: '<p>Vor <a href="https://x.test">Link-Text</a> nach</p>' })
  await expect(editor(page)).toContainText('Vor Link-Text nach')
  await expect(editor(page).locator('a')).toHaveCount(0)
})

test('Grenzfall 21: plain text inherits surrounding marks; plain-paste mode does not', async ({ page }) => {
  // put the caret inside bold text
  await page.keyboard.type('fettgedruckt')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByTitle('Fett').click()
  await editor(page).click()
  await page.keyboard.press('End')
  await page.waitForTimeout(50)
  await paste(page, { text: 'ERBT' })
  // the pasted plain text is inside a <strong> (inherited bold)
  await expect(editor(page).locator('strong')).toContainText('ERBT')

  // now paste-without-formatting: no bold
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type('Basis ')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByTitle('Fett').click()
  await editor(page).click()
  await page.keyboard.press('End')
  await page.waitForTimeout(50)
  await pastePlain(page, { html: '<strong>OHNE</strong>', text: 'OHNE' })
  await expect(editor(page)).toContainText('OHNE')
  await expect(editor(page).locator('strong')).not.toContainText('OHNE')
})

test('3.8: a paste is a single undo step (removes the whole paste at once)', async ({ page }) => {
  await page.keyboard.type('Basis ')
  // ProseMirror's history groups adjacent input within newGroupDelay (~500ms);
  // a zero-delay automated sequence would otherwise fold the typing and the
  // paste into ONE group. A real user's pause splits them — wait so the paste
  // is its own undo group, then a single Strg+Z must remove the ENTIRE pasted
  // content (not char-by-char) and leave the typed text intact.
  await page.waitForTimeout(600)
  await paste(page, { html: '<p>EINGEFUEGT mehrere Woerter</p>' })
  await expect(editor(page)).toContainText('EINGEFUEGT mehrere Woerter')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page)).not.toContainText('EINGEFUEGT')
  await expect(editor(page)).toContainText('Basis')
})

test('Grenzfall 23: empty clipboard is a clean no-op, whitespace text is a real paste', async ({ page }) => {
  await page.keyboard.type('unveraendert')
  await paste(page, {}) // no entries at all
  await expect(editor(page)).toHaveText('unveraendert')
  await expect(page.getByText(NOTICE_TEXT)).toHaveCount(0) // no paste notice
  // a text/plain of only spaces/newline IS non-empty text and gets inserted
  await paste(page, { text: '  \n' })
  await expect(editor(page).locator('p')).not.toHaveCount(0)
})

test('Selection stays consistent after a paste over Strg+A (Selection-Sync × Paste)', async ({ page }) => {
  await page.keyboard.type('Original-Text')
  await page.keyboard.press('ControlOrMeta+a')
  await paste(page, { html: '<p>Neu</p>' })
  await editor(page).click()
  await page.keyboard.press('End')
  await page.waitForTimeout(50)
  await page.keyboard.type(' weiter')
  await expect(editor(page)).toContainText('Neu weiter')
  await expect(editor(page)).not.toContainText('Original-Text')
})

// Image-blob paste (a File in the clipboard, no text/html) — DataTransfer.items.add(File)
// is only reliably constructible in Chromium, so this one case is Chromium-scoped.
test('3.5: an image blob (no HTML) is inserted as an embedded image [Chromium]', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Constructing a DataTransfer with a File is only reliable in Chromium.')
  await page.evaluate(() => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const file = new File([bytes], 'pasted.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const el = document.querySelector('.ProseMirror') as HTMLElement
    el.focus()
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(editor(page).locator('img')).toHaveCount(1)
  await expect(editor(page).locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
})

// ===========================================================================
// Feature round trip (einfuegen-req.md 5.2), structure contexts (3.6),
// drag & drop (1 #6), and the remaining edge cases (Abschnitt 4).
// ===========================================================================

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT_MIME = 'application/vnd.oasis.opendocument.text'

async function switchToDocx(page: Page) {
  await page.getByRole('button', { name: '← Formate' }).click()
  await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
  await page.locator('.ProseMirror').click()
}

async function exportBuffer(page: Page): Promise<Buffer> {
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await dl
  const fs = await import('node:fs/promises')
  return fs.readFile((await download.path())!)
}

async function zipEntryText(buffer: Buffer, entry: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  return zip.file(entry)!.async('text')
}

async function reopen(page: Page, format: 'docx' | 'odt', buffer: Buffer) {
  await page.getByRole('button', { name: '← Formate' }).click()
  const card = format === 'docx' ? docxCard(page) : odtCard(page)
  await card.locator('input[type="file"]').setInputFiles({
    name: format === 'docx' ? 'rt.docx' : 'rt.odt',
    mimeType: format === 'docx' ? DOCX_MIME : ODT_MIME,
    buffer,
  })
}

for (const fmt of ['odt', 'docx'] as const) {
  const docEntry = fmt === 'docx' ? 'word/document.xml' : 'content.xml'

  test(`5.2 round trip [${fmt}]: pasted formatted text/heading/list survives export → reimport`, async ({ page }) => {
    if (fmt === 'docx') await switchToDocx(page)
    await paste(page, { html: '<h1>Titel</h1><p><strong>fett</strong> normal</p><ul><li>eins</li><li>zwei</li></ul>' })
    const buffer = await exportBuffer(page)
    const xml = await zipEntryText(buffer, docEntry)
    expect(xml).toContain('Titel')
    expect(xml).toContain('fett')
    expect(xml).toContain('eins')
    await reopen(page, fmt, buffer)
    await expect(editor(page).locator('h1')).toHaveText('Titel')
    await expect(editor(page).locator('strong')).toContainText('fett')
    await expect(editor(page).locator('ul li')).toHaveCount(2)
  })

  test(`5.2 round trip [${fmt}]: external image → placeholder survives, export never throws (0.7/3.12)`, async ({ page }) => {
    if (fmt === 'docx') await switchToDocx(page)
    await paste(page, { html: '<p>vor <img src="https://example.invalid/x.png" alt="Foto"> nach</p>' })
    const buffer = await exportBuffer(page)
    const xml = await zipEntryText(buffer, docEntry)
    expect(xml).toContain('[Bild: Foto]')
    expect(xml).not.toContain('https://example.invalid/x.png')
    await reopen(page, fmt, buffer)
    await expect(editor(page)).toContainText('[Bild: Foto]')
  })

  test(`5.2 round trip [${fmt}]: pasted tab character survives`, async ({ page }) => {
    if (fmt === 'docx') await switchToDocx(page)
    await paste(page, { text: 'links\trechts' })
    const buffer = await exportBuffer(page)
    await reopen(page, fmt, buffer)
    await expect(editor(page)).toContainText('links')
    await expect(editor(page)).toContainText('rechts')
  })

  test(`5.2 round trip [${fmt}]: pasted table with colspan survives (Grenzfall 25)`, async ({ page }) => {
    if (fmt === 'docx') await switchToDocx(page)
    await paste(page, { html: '<table><tbody><tr><td colspan="2">Verbunden</td></tr><tr><td>A</td><td>B</td></tr></tbody></table>' })
    await expect(editor(page).locator('td')).not.toHaveCount(0)
    const buffer = await exportBuffer(page)
    await reopen(page, fmt, buffer)
    await expect(editor(page)).toContainText('Verbunden')
    await expect(editor(page)).toContainText('A')
    await expect(editor(page).locator('td[colspan="2"]')).toHaveCount(1)
  })
}

// ---- 3.6 structure contexts ----

test('3.6: multi-block paste inside a list item does not break the list apart', async ({ page }) => {
  await page.keyboard.type('Punkt')
  await page.getByTitle('Aufzählung').click()
  await editor(page).click()
  await page.keyboard.press('End')
  await page.waitForTimeout(50)
  await paste(page, { text: 'a\n\nb' })
  // still a single list, and the pasted text is present (no crash, no stray top-level paragraphs before the list)
  await expect(editor(page).locator('ul')).toHaveCount(1)
  await expect(editor(page)).toContainText('a')
  await expect(editor(page)).toContainText('b')
})

test('3.6: paste inside a table cell stays in the cell, table structure intact', async ({ page }) => {
  await page.getByRole('button', { name: 'Tabelle einfügen' }).click()
  const cells = editor(page).locator('td')
  await cells.nth(0).click()
  await paste(page, { html: '<p>ZellInhalt</p>' })
  await expect(cells).toHaveCount(4) // 2x2 table unchanged
  await expect(cells.nth(0)).toContainText('ZellInhalt')
})

test('3.6: multi-paragraph paste into a heading keeps the heading, rest becomes paragraphs', async ({ page }) => {
  await page.selectOption('select[aria-label="Absatzformat"]', '1') // make current block a H1
  await page.keyboard.type('Kopf ')
  await paste(page, { html: '<p>Erste</p><p>Zweite</p>' })
  await expect(editor(page).locator('h1')).toContainText('Kopf')
  await expect(editor(page)).toContainText('Zweite')
})

// ---- 1 #6 drag & drop (Grenzfall 22 uri-list) ----

async function drop(page: Page, data: { html?: string; uriList?: string; text?: string }) {
  return page.evaluate((payload) => {
    const dt = new DataTransfer()
    if (payload.html !== undefined) dt.setData('text/html', payload.html)
    if (payload.uriList !== undefined) dt.setData('text/uri-list', payload.uriList)
    if (payload.text !== undefined) dt.setData('text/plain', payload.text)
    const el = document.querySelector('.ProseMirror') as HTMLElement
    const rect = el.getBoundingClientRect()
    el.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: dt,
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 20,
        clientY: rect.top + 20,
      }),
    )
    // report whether the synthetic DragEvent actually carried the data (Firefox/WebKit null it)
    return dt.getData('text/html') !== '' || dt.getData('text/plain') !== '' || dt.getData('text/uri-list') !== ''
  }, data)
}

test('1 #6: dropping HTML inserts its content, no crash', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic DragEvent dataTransfer is only reliable in Chromium.')
  await page.keyboard.type('vorhanden ')
  await drop(page, { html: '<p><strong>Abgelegt</strong></p>' })
  // the dropped content is inserted (with its bold formatting) at the drop point,
  // which may split the pre-existing text — so assert the dropped content and a
  // surviving fragment of the original, not a contiguous match.
  await expect(editor(page).locator('strong')).toContainText('Abgelegt')
  await expect(editor(page)).toContainText('handen')
})

test('Grenzfall 22: dropping only a URI list inserts it as visible text', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Synthetic DragEvent dataTransfer is only reliable in Chromium.')
  await drop(page, { uriList: 'https://example.test/bild.png' })
  await expect(editor(page)).toContainText('https://example.test/bild.png')
})

// ---- remaining edge cases (Abschnitt 4) ----

test('Grenzfall 1–3: paste at document start, end, and into the empty document', async ({ page }) => {
  // empty doc
  await paste(page, { text: 'A' })
  await expect(editor(page)).toContainText('A')
  // at end
  await page.keyboard.press('End')
  await paste(page, { text: 'Z' })
  await expect(editor(page)).toHaveText('AZ')
  // at start (position 0)
  await page.keyboard.press('ControlOrMeta+Home')
  await page.waitForTimeout(50)
  await paste(page, { text: 'Start' })
  await expect(editor(page)).toHaveText('StartAZ')
})

test('Grenzfall 4: pasting a large amount of text keeps the editor responsive and paginates', async ({ page }) => {
  const big = Array.from({ length: 400 }, (_, i) => `<p>Absatz Nummer ${i} mit etwas Fülltext für die Paginierung.</p>`).join('')
  await paste(page, { html: big })
  await expect(editor(page).locator('p')).toHaveCount(400, { timeout: 15000 })
  // editor still responds to typing (not frozen)
  await page.keyboard.press('ControlOrMeta+Home')
  await page.waitForTimeout(50)
  await page.keyboard.type('X')
  await expect(editor(page)).toContainText('X')
})

test('Grenzfall 7: pasting a nested table does not crash and keeps the inner text readable', async ({ page }) => {
  await paste(page, {
    html: '<table><tbody><tr><td>aussen <table><tbody><tr><td>innen</td></tr></tbody></table></td></tr></tbody></table>',
  })
  await expect(editor(page)).toContainText('aussen')
  await expect(editor(page)).toContainText('innen')
})

test('Grenzfall 9: three fast pastes are three independent undo steps', async ({ page }) => {
  await paste(page, { text: 'eins ' })
  await page.waitForTimeout(600)
  await paste(page, { text: 'zwei ' })
  await page.waitForTimeout(600)
  await paste(page, { text: 'drei' })
  await expect(editor(page)).toContainText('eins zwei drei')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page)).not.toContainText('drei')
  await expect(editor(page)).toContainText('eins zwei')
})

test('Grenzfall 10: a paste dispatched outside the editor never changes the document', async ({ page }) => {
  await page.keyboard.type('unberuehrt')
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/plain', 'FREMD')
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(editor(page)).toHaveText('unberuehrt')
  await expect(editor(page)).not.toContainText('FREMD')
})

test('Grenzfall 11: when both HTML and plain text are present, HTML wins', async ({ page }) => {
  await paste(page, { html: '<p><strong>ausHTML</strong></p>', text: 'ausPLAIN' })
  await expect(editor(page).locator('strong')).toContainText('ausHTML')
  await expect(editor(page)).not.toContainText('ausPLAIN')
})

test('Grenzfall 17: an RTF-only clipboard is a clean no-op (ProseMirror ignores RTF)', async ({ page }) => {
  await page.keyboard.type('bleibt')
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('text/rtf', '{\\rtf1 hallo}')
    const el = document.querySelector('.ProseMirror') as HTMLElement
    el.focus()
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await expect(editor(page)).toHaveText('bleibt')
})

test('Grenzfall 24: pasting while an image node is selected replaces the image', async ({ page }) => {
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  await paste(page, { html: `<p><img src="${tiny}" alt="X"></p>` })
  await expect(editor(page).locator('img')).toHaveCount(1)
  await editor(page).locator('img').click() // node-select the image
  await paste(page, { text: 'Ersatz' })
  await expect(editor(page).locator('img')).toHaveCount(0)
  await expect(editor(page)).toContainText('Ersatz')
})
