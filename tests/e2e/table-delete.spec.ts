import { test, expect, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { insertTableViaDialog } from './fixtures/table-helpers'

// "Tabelle löschen" — the explicit whole-table delete button, incl. the mandatory
// NodeSelection-on-table case (Backspace after a table). See
// specs/tabelle-erstellen-loeschen-req.md §2.8/§2.9/§4.2/§5.2. Runs on Desktop Chrome,
// Mobile (Pixel 7) and Tablet (iPad Mini).

function odtCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}
function docxCard(page: Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}
const tables = (page: Page) => page.locator('.word-editor-surface .ProseMirror table')
const cellAt = (page: Page, i: number) => page.locator('.word-editor-surface .ProseMirror td').nth(i)
const deleteButton = (page: Page) => page.getByRole('button', { name: 'Tabelle löschen' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DOCX = join(__dirname, '../fixtures/external/docx')
const FIXTURES_ODT = join(__dirname, '../fixtures/external/odt')
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const ODT_MIME = 'application/vnd.oasis.opendocument.text'
// 1×1 transparent PNG, passed to the upload input as an in-memory buffer (no file artifact).
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/** Exports via the real download and returns the file's bytes. */
async function exportBytes(page: Page): Promise<Buffer> {
  const fs = await import('node:fs/promises')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportieren' }).click()
  const download = await downloadPromise
  return fs.readFile((await download.path())!)
}

/** Wartet, bis das Layout der ersten Tabellenzelle über mehrere Messungen stabil steht.
 * Unter CI-Last (beobachtet auf dem WebKit-Tablet-Projekt) brauchen große Fremddateien
 * einen Moment, bis Schriften geladen sind und die Paginierung konvergiert — ein sofortiger
 * Zell-Klick scheitert sonst an einem noch wandernden Ziel ("element is not stable"). */
async function waitForStableLayout(page: Page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.word-editor-surface .ProseMirror td, .word-editor-surface .ProseMirror th')
      if (!el) return false
      const r = el.getBoundingClientRect()
      const key = `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`
      const w = window as unknown as { __pwStableKey?: string; __pwStableCount?: number }
      if (w.__pwStableKey === key) w.__pwStableCount = (w.__pwStableCount ?? 0) + 1
      else w.__pwStableCount = 0
      w.__pwStableKey = key
      return (w.__pwStableCount ?? 0) >= 4
    },
    undefined,
    { polling: 150, timeout: 20_000 },
  )
}

/** Re-imports previously exported bytes through the real upload UI (back via "Formate"). */
async function reimport(
  page: Page,
  card: (p: Page) => ReturnType<typeof odtCard>,
  name: string,
  mimeType: string,
  buffer: Buffer,
) {
  await page.getByRole('button', { name: /formate/i }).click()
  await card(page).locator('input[type="file"]').setInputFiles({ name, mimeType, buffer })
  await expect(page.locator('.word-editor-surface .ProseMirror')).toBeVisible()
}

async function openEditor(page: Page, card: (p: Page) => ReturnType<typeof odtCard> = odtCard) {
  page.on('dialog', (d) => d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: /verstanden/i }).click()
  await card(page).getByRole('button', { name: 'Neu erstellen' }).click()
  const editor = page.locator('.word-editor-surface .ProseMirror')
  await expect(editor).toBeVisible()
  await editor.click()
  return editor
}

/** Opens a fresh doc and builds `davor` / table / `danach`; returns with the cursor in the
 * table's first cell. */
async function tableBetweenParagraphs(page: Page, card: (p: Page) => ReturnType<typeof odtCard> = odtCard) {
  const editor = await openEditor(page, card)
  await page.keyboard.type('davor')
  await page.keyboard.press('Enter')
  await page.keyboard.type('danach')
  await page.keyboard.press('Home') // to the start of "danach"
  await insertTableViaDialog(page, 2, 2)
  await expect(tables(page)).toHaveCount(1)
  return editor
}

async function dragSelectCells(page: Page, a: number, b: number) {
  const boxA = await cellAt(page, a).boundingBox()
  const boxB = await cellAt(page, b).boundingBox()
  await page.mouse.move(boxA!.x + boxA!.width / 2, boxA!.y + boxA!.height / 2)
  await page.mouse.down()
  await page.mouse.move(boxB!.x + boxB!.width / 2, boxB!.y + boxB!.height / 2, { steps: 8 })
  await page.mouse.up()
}

test.describe('Tabelle löschen', () => {
  test('is disabled outside a table and enabled with the cursor in a cell', async ({ page }) => {
    await openEditor(page)
    await page.locator('.word-editor-surface .ProseMirror').click()
    await expect(deleteButton(page)).toBeDisabled()
    await insertTableViaDialog(page, 2, 2)
    await cellAt(page, 0).click()
    await expect(deleteButton(page)).toBeEnabled()
  })

  test('removes the whole table from a cursor in a cell; text before and after stays', async ({ page }) => {
    const editor = await tableBetweenParagraphs(page)
    await cellAt(page, 0).click()
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)
    await expect(editor).toContainText('davor')
    await expect(editor).toContainText('danach')
  })

  test('a multi-cell CellSelection deletes the ENTIRE table, not just the selected cells', async ({ page }) => {
    await openEditor(page)
    await insertTableViaDialog(page, 2, 2)
    await dragSelectCells(page, 0, 1)
    await expect(page.locator('.word-editor-surface .ProseMirror .selectedCell').first()).toBeVisible()
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)
  })

  test('a CellSelection spanning EVERY cell deletes the whole table (§2.8), not row/column-wise', async ({ page }) => {
    await openEditor(page)
    await insertTableViaDialog(page, 2, 2)
    // Drag-select all four cells (top-left → bottom-right): a CellSelection covering the entire
    // table. "Tabelle löschen" must still remove the whole table in one step.
    await dragSelectCells(page, 0, 3)
    await expect(page.locator('.word-editor-surface .ProseMirror .selectedCell')).toHaveCount(4)
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)
  })

  // NOTE on §2.9 (whole-table NodeSelection, e.g. from Backspace directly after a table): that
  // selection state is NOT reachable through the keyboard in this editor — verified empirically,
  // Backspace/Delete at the table boundary merge across it (join) rather than node-selecting the
  // table (the table never gets `.ProseMirror-selectednode`). The delete command still handles a
  // table NodeSelection defensively (canDeleteTable / deleteTableAtSelection avoid the RangeError
  // selectedRect would throw), which is covered directly by the unit test
  // src/formats/shared/editor/__tests__/table-delete.test.ts. See req §9.

  test('the delete button fires via keyboard Enter AND Space', async ({ page }) => {
    // Enter
    await openEditor(page)
    await insertTableViaDialog(page, 2, 2)
    await cellAt(page, 0).click()
    await deleteButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(tables(page)).toHaveCount(0)
    // Space
    await insertTableViaDialog(page, 2, 2)
    await cellAt(page, 0).click()
    await deleteButton(page).focus()
    await page.keyboard.press('Space')
    await expect(tables(page)).toHaveCount(0)
  })

  test('Undo restores the deleted table, Redo removes it again', async ({ page }) => {
    await openEditor(page)
    await insertTableViaDialog(page, 3, 2)
    await cellAt(page, 0).click()
    await page.keyboard.type('Inhalt')
    // prosemirror-history groups edits within newGroupDelay (~500ms); a real user pauses
    // between typing and deleting, so wait past it to make the delete its own undo step —
    // otherwise a single Ctrl+Z would revert the whole insert+type+delete group (§2.12).
    await page.waitForTimeout(600)
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)

    await page.locator('.word-editor-surface .ProseMirror').click()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(tables(page)).toHaveCount(1)
    await expect(page.locator('.word-editor-surface .ProseMirror table')).toContainText('Inhalt') // restored intact
    await page.keyboard.press('ControlOrMeta+y')
    await expect(tables(page)).toHaveCount(0)
  })

  test('nested table: deleting from the inner table removes ONLY the inner one', async ({ page }) => {
    await openEditor(page)
    await insertTableViaDialog(page, 2, 2) // outer
    await cellAt(page, 0).click()
    await insertTableViaDialog(page, 2, 2) // inner, inside the outer's first cell
    await expect(tables(page)).toHaveCount(2)

    // cursor into a cell of the INNER table (a "table table" descendant)
    await page.locator('.word-editor-surface .ProseMirror table table td').first().click()
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(1) // outer survives
  })

  test('selection-sync: typing in one cell then clicking another cell, then deleting, removes the table cleanly', async ({
    page,
  }) => {
    await openEditor(page)
    await insertTableViaDialog(page, 2, 2)
    await cellAt(page, 0).click()
    await page.keyboard.type('AAA')
    await cellAt(page, 3).click() // re-position the cursor to a different cell
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)
    await expect(page.locator('.word-editor-surface .ProseMirror')).not.toContainText('AAA')
  })
})

test.describe('Rundreise: gelöschte Tabelle bleibt über Export/Reimport entfernt', () => {
  test('DOCX §4.2.1: delete a table, export → no table markup; reimport → only the two paragraphs', async ({ page }) => {
    await tableBetweenParagraphs(page, docxCard)
    await cellAt(page, 0).click()
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)

    const buffer = await exportBytes(page)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('text')
    expect(xml).not.toContain('<w:tbl')
    expect(xml).toContain('davor')
    expect(xml).toContain('danach')

    await reimport(page, docxCard, 'reimport-del.docx', DOCX_MIME, buffer)
    await expect(tables(page)).toHaveCount(0)
    await expect(page.locator('.word-editor-surface .ProseMirror p').filter({ hasText: 'davor' })).toHaveCount(1)
    await expect(page.locator('.word-editor-surface .ProseMirror p').filter({ hasText: 'danach' })).toHaveCount(1)
  })

  test('ODT §4.2.2: delete a table, export → no table markup; reimport → only the two paragraphs', async ({ page }) => {
    await tableBetweenParagraphs(page, odtCard)
    await cellAt(page, 0).click()
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)

    const buffer = await exportBytes(page)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('content.xml')!.async('text')
    expect(xml).not.toContain('<table:table')
    expect(xml).toContain('davor')
    expect(xml).toContain('danach')

    await reimport(page, odtCard, 'reimport-del.odt', ODT_MIME, buffer)
    await expect(tables(page)).toHaveCount(0)
    await expect(page.locator('.word-editor-surface .ProseMirror p').filter({ hasText: 'davor' })).toHaveCount(1)
    await expect(page.locator('.word-editor-surface .ProseMirror p').filter({ hasText: 'danach' })).toHaveCount(1)
  })

  /** Builds davor/Tabelle(Text fett + Bild + Aufzählungsliste)/danach and deletes the table.
   * Covers §4.2.3 (Tabelle mit Inhalt) and §5.2.23 (keine verwaisten Bild-Dateien). */
  async function contentTableDeleted(page: Page, card: (p: Page) => ReturnType<typeof odtCard>) {
    await tableBetweenParagraphs(page, card)
    // Zelle 0: Text, ein Wort fett (deterministische Tastatur-Wortselektion, engine-neutral)
    await cellAt(page, 0).click()
    await page.keyboard.type('Zellwort geheim')
    for (let i = 0; i < 'geheim'.length; i++) await page.keyboard.press('Shift+ArrowLeft')
    await page.getByRole('button', { name: 'Fett' }).click()
    await expect(page.locator('.word-editor-surface .ProseMirror td strong').first()).toHaveText('geheim')
    // Zelle 1: Bild (über den echten Upload-Weg, in-memory PNG)
    await cellAt(page, 1).click()
    await page
      .locator('label:has-text("Bild")')
      .locator('input[type=file]')
      .setInputFiles({ name: 'zellbild.png', mimeType: 'image/png', buffer: TINY_PNG })
    await expect(page.locator('.word-editor-surface .ProseMirror table img')).toHaveCount(1)
    // Zelle 2: Aufzählungsliste (Button hat sichtbaren Text "• Liste", Titel "Aufzählung" —
    // der Accessible Name ist der Textinhalt, daher über den Titel ansprechen)
    await cellAt(page, 2).click()
    await page.getByTitle('Aufzählung', { exact: true }).click()
    await page.keyboard.type('Listenpunkt')
    await expect(page.locator('.word-editor-surface .ProseMirror table ul li')).toHaveCount(1)

    await cellAt(page, 0).click()
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)
    return exportBytes(page)
  }

  test('DOCX §4.2.3/§5.2.23: Tabelle mit Text/Fett/Bild/Liste löschen → kein Inhalt, keine verwaisten media/rels', async ({
    page,
  }) => {
    const buffer = await contentTableDeleted(page, docxCard)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('text')
    expect(xml).not.toContain('<w:tbl')
    expect(xml).not.toContain('Zellwort')
    expect(xml).not.toContain('Listenpunkt')
    expect(xml).toContain('davor')
    expect(xml).toContain('danach')
    // keine verwaisten Bilddateien oder Relationship-Einträge (§5.2.23)
    const media = Object.keys(zip.files).filter((p) => p.startsWith('word/media/') && !zip.files[p].dir)
    expect(media).toHaveLength(0)
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('text')
    expect(rels).not.toContain('media/')

    await reimport(page, docxCard, 'reimport-content.docx', DOCX_MIME, buffer)
    await expect(tables(page)).toHaveCount(0)
    await expect(page.locator('.word-editor-surface .ProseMirror')).not.toContainText('Zellwort')
    await expect(page.locator('.word-editor-surface .ProseMirror img')).toHaveCount(0)
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('davor')
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('danach')
  })

  test('ODT §4.2.3/§5.2.23: Tabelle mit Text/Fett/Bild/Liste löschen → kein Inhalt, keine verwaisten Pictures', async ({
    page,
  }) => {
    const buffer = await contentTableDeleted(page, odtCard)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('content.xml')!.async('text')
    expect(xml).not.toContain('<table:table')
    expect(xml).not.toContain('Zellwort')
    expect(xml).not.toContain('Listenpunkt')
    expect(xml).toContain('davor')
    expect(xml).toContain('danach')
    const pictures = Object.keys(zip.files).filter((p) => p.startsWith('Pictures/') && !zip.files[p].dir)
    expect(pictures).toHaveLength(0)
    const manifest = await zip.file('META-INF/manifest.xml')!.async('text')
    expect(manifest).not.toContain('Pictures/')

    await reimport(page, odtCard, 'reimport-content.odt', ODT_MIME, buffer)
    await expect(tables(page)).toHaveCount(0)
    await expect(page.locator('.word-editor-surface .ProseMirror')).not.toContainText('Zellwort')
    await expect(page.locator('.word-editor-surface .ProseMirror img')).toHaveCount(0)
  })

  /** Builds two tables with distinct cell markers (ERSTE/ZWEITE) and deletes the ERSTE one. */
  async function deleteOneOfTwoTables(page: Page, card: (p: Page) => ReturnType<typeof odtCard>) {
    const editor = await openEditor(page, card)
    await page.keyboard.type('davor')
    await page.keyboard.press('Enter')
    await page.keyboard.type('danach')
    await page.keyboard.press('Home')
    await insertTableViaDialog(page, 2, 2)
    await cellAt(page, 0).click()
    await page.keyboard.type('ZWEITE')
    await editor.locator('p', { hasText: 'davor' }).click()
    await page.keyboard.press('End')
    await insertTableViaDialog(page, 2, 2)
    await expect(tables(page)).toHaveCount(2)
    // Dokumentreihenfolge jetzt: davor · ERSTE-Tabelle · ZWEITE-Tabelle · danach —
    // cellAt(0) ist also die erste Zelle der neu eingefügten (vorderen) Tabelle.
    await cellAt(page, 0).click()
    await page.keyboard.type('ERSTE')

    // Cursor steht in der ERSTE-Tabelle → genau diese wird gelöscht
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(1)
    await expect(page.locator('.word-editor-surface .ProseMirror table')).toContainText('ZWEITE')
    await expect(page.locator('.word-editor-surface .ProseMirror')).not.toContainText('ERSTE')
    return exportBytes(page)
  }

  test('DOCX §4.2.5: von zwei Tabellen nur eine löschen → die andere bleibt vollständig erhalten', async ({ page }) => {
    const buffer = await deleteOneOfTwoTables(page, docxCard)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('text')
    expect((xml.match(/<w:tbl\b/g) ?? []).length).toBe(1)
    expect(xml).toContain('ZWEITE')
    expect(xml).not.toContain('ERSTE')

    await reimport(page, docxCard, 'reimport-two.docx', DOCX_MIME, buffer)
    await expect(tables(page)).toHaveCount(1)
    await expect(page.locator('.word-editor-surface .ProseMirror table tr')).toHaveCount(2)
    await expect(page.locator('.word-editor-surface .ProseMirror table')).toContainText('ZWEITE')
  })

  test('ODT §4.2.5: von zwei Tabellen nur eine löschen → die andere bleibt vollständig erhalten', async ({ page }) => {
    const buffer = await deleteOneOfTwoTables(page, odtCard)
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('content.xml')!.async('text')
    expect((xml.match(/<table:table[ >]/g) ?? []).length).toBe(1)
    expect(xml).toContain('ZWEITE')
    expect(xml).not.toContain('ERSTE')

    await reimport(page, odtCard, 'reimport-two.odt', ODT_MIME, buffer)
    await expect(tables(page)).toHaveCount(1)
    await expect(page.locator('.word-editor-surface .ProseMirror table tr')).toHaveCount(2)
    await expect(page.locator('.word-editor-surface .ProseMirror table')).toContainText('ZWEITE')
  })

  // §4.2.8 verlangt "als ODT exportieren → reimportieren → als DOCX exportieren → reimportieren".
  // Die App hat keinen Cross-Format-Export (der eine "Exportieren"-Button exportiert immer im
  // geöffneten Format — dieselbe, bereits in cut.spec.ts dokumentierte App-Grenze). Angepasst
  // auf das real Bedienbare: doppelte native Rundreise — die gelöschte Tabelle muss über ZWEI
  // aufeinanderfolgende Export→Reimport-Zyklen abwesend bleiben. Vermerkt in req §9.3.
  test('§4.2.8 (angepasst): gelöschte Tabelle bleibt über zwei Export→Reimport-Zyklen abwesend', async ({ page }) => {
    await tableBetweenParagraphs(page, odtCard)
    await cellAt(page, 0).click()
    await deleteButton(page).click()
    await expect(tables(page)).toHaveCount(0)

    const first = await exportBytes(page)
    expect(await (await JSZip.loadAsync(first)).file('content.xml')!.async('text')).not.toContain('<table:table')
    await reimport(page, odtCard, 'zyklus-1.odt', ODT_MIME, first)
    await expect(tables(page)).toHaveCount(0)

    const second = await exportBytes(page)
    const xml = await (await JSZip.loadAsync(second)).file('content.xml')!.async('text')
    expect(xml).not.toContain('<table:table')
    expect(xml).toContain('davor')
    expect(xml).toContain('danach')
    await reimport(page, odtCard, 'zyklus-2.odt', ODT_MIME, second)
    await expect(tables(page)).toHaveCount(0)
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('davor')
    await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('danach')
  })
})

// §4.2.7/§5.2.20: reale Fremddateien — Tabellen über den echten Toolbar-Button löschen,
// Rundreise: Tabelle(n) fehlen, aller übriger Inhalt bleibt erhalten.
test.describe('Rundreise: reale Fremddatei-Fixtures', () => {
  const REAL_FIXTURES: Array<{ format: 'docx' | 'odt'; name: string }> = [
    { format: 'docx', name: 'bug57031.docx' },
    { format: 'odt', name: 'BigTable.odt' },
    { format: 'odt', name: 'subTables.odt' }, // verschachtelt
    { format: 'odt', name: 'tableCoveredContent.odt' }, // exotische Merges (covered cells)
  ]

  for (const fx of REAL_FIXTURES) {
    test(`${fx.name}: alle Tabellen per Button löschen → Export ohne Tabellen-Markup, Rest bleibt`, async ({
      page,
    }) => {
      page.on('dialog', (d) => d.accept())
      await page.goto('/')
      await page.getByRole('button', { name: /verstanden/i }).click()
      const card = fx.format === 'docx' ? docxCard(page) : odtCard(page)
      const dir = fx.format === 'docx' ? FIXTURES_DOCX : FIXTURES_ODT
      const mime = fx.format === 'docx' ? DOCX_MIME : ODT_MIME
      await card.locator('input[type="file"]').setInputFiles({
        name: fx.name,
        mimeType: mime,
        buffer: readFileSync(join(dir, fx.name)),
      })
      await expect(page.locator('.word-editor-surface .ProseMirror')).toBeVisible()
      const initialTables = await tables(page).count()
      expect(initialTables, 'Fixture muss mindestens eine Tabelle enthalten').toBeGreaterThan(0)

      // Erwarteter Rest: aller Text AUSSERHALB von Tabellen (vor dem Löschen erfasst).
      const remaining = await page.evaluate(() => {
        const clone = document.querySelector('.ProseMirror')!.cloneNode(true) as HTMLElement
        clone.querySelectorAll('table').forEach((t) => t.remove())
        return clone.textContent ?? ''
      })

      // Erst das Layout zur Ruhe kommen lassen (CI-Last/WebKit, s. waitForStableLayout) …
      await waitForStableLayout(page)
      // … dann alle Tabellen einzeln über den echten Button löschen (bei Verschachtelung
      // entfernt ein Klick in eine innere Zelle zuerst die innere Tabelle — die Schleife
      // räumt auf).
      for (let guard = 0; guard < 40 && (await tables(page).count()) > 0; guard++) {
        // Klick nahe der Zell-Ecke (nicht Mitte): landet auch bei verschachtelten Tabellen
        // oder Bildern im Zellinhalt zuverlässig IN der Zelle; 5px bleibt selbst bei durch
        // Fit-Zoom verkleinerten Zellen innerhalb der Box.
        await page.locator('.word-editor-surface .ProseMirror td, .ProseMirror th').first().click({ position: { x: 5, y: 5 } })
        await expect(deleteButton(page)).toBeEnabled()
        await deleteButton(page).click()
      }
      await expect(tables(page)).toHaveCount(0)

      const buffer = await exportBytes(page)
      const zip = await JSZip.loadAsync(buffer)
      const xml =
        fx.format === 'docx'
          ? await zip.file('word/document.xml')!.async('text')
          : await zip.file('content.xml')!.async('text')
      if (fx.format === 'docx') expect(xml).not.toContain('<w:tbl')
      else expect(xml).not.toContain('<table:table')

      // Reimport: kein Tabellenrest, der übrige (Nicht-Tabellen-)Inhalt ist noch da —
      // stichprobenartig über die markantesten Wörter, robust gegen Whitespace-Normalisierung.
      await reimport(page, fx.format === 'docx' ? docxCard : odtCard, `reimport-${fx.name}`, mime, buffer)
      await expect(tables(page)).toHaveCount(0)
      const words = Array.from(new Set(remaining.match(/[A-Za-zÄÖÜäöüß0-9]{4,}/g) ?? []))
        .sort((a, b) => b.length - a.length)
        .slice(0, 5)
      for (const word of words) {
        await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText(word)
      }
    })
  }
})

// §5.2.22: große Tabelle löschen — UI bleibt reaktionsfähig, Undo stellt die komplette
// Struktur inkl. Zellinhalt wieder her.
test('20×20-Tabelle löschen: UI bleibt reaktionsfähig, Undo stellt die volle Struktur wieder her', async ({
  page,
}) => {
  await openEditor(page)
  await insertTableViaDialog(page, 20, 20)
  await expect(page.locator('.word-editor-surface .ProseMirror table tr')).toHaveCount(20)
  await page.waitForTimeout(600) // eigene History-Gruppe fürs Tippen
  await cellAt(page, 0).click()
  await page.keyboard.type('X1')
  await page.waitForTimeout(600) // eigene History-Gruppe fürs Löschen

  await deleteButton(page).click()
  await expect(tables(page)).toHaveCount(0)

  // Reaktionsfähigkeit: direkt weitertippen funktioniert sofort
  await page.waitForTimeout(600) // eigene History-Gruppe für die Tipp-Probe
  await page.keyboard.type('reaktiv')
  await expect(page.locator('.word-editor-surface .ProseMirror')).toContainText('reaktiv')

  // Undo-Treue: 1× Undo entfernt die Tipp-Probe, 2× stellt die 20×20-Tabelle samt Inhalt wieder her
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.word-editor-surface .ProseMirror')).not.toContainText('reaktiv')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(tables(page)).toHaveCount(1)
  await expect(page.locator('.word-editor-surface .ProseMirror table tr')).toHaveCount(20)
  await expect(page.locator('.word-editor-surface .ProseMirror table tr').first().locator('td, th')).toHaveCount(20)
  await expect(cellAt(page, 0)).toHaveText('X1')
  await page.keyboard.press('ControlOrMeta+y')
  await expect(tables(page)).toHaveCount(0)
})

// Abnahmemaßstab §4: Formatierungsverluste außerhalb der gelöschten Tabelle sind nicht
// akzeptabel; Undo stellt auch Formatierung IN der Tabelle wieder her.
test('gemischte Formatierung: Löschen lässt äußere Formatierung unangetastet, Undo stellt innere wieder her', async ({
  page,
}) => {
  const editor = await openEditor(page)
  await page.keyboard.type('davor fett')
  // 'fett' deterministisch per Tastatur selektieren (dblclick-Wortselektion ist engine-abhängig)
  for (let i = 0; i < 'fett'.length; i++) await page.keyboard.press('Shift+ArrowLeft')
  await page.getByRole('button', { name: 'Fett' }).click()
  await expect(editor.locator('p strong')).toHaveText('fett')
  // ProseMirror verwirft native DOM-Selektionsänderungen kurz nach dem view.focus() des
  // Button-Handlers (selectionToDOM-Suppression). Ein sofortiges End würde verschluckt und
  // das folgende Enter ersetzte die noch aktive 'fett'-Range — nur bei Playwright-Tempo
  // erreichbar, kein reales Nutzerszenario. Kurz warten, dann kollabieren.
  await page.waitForTimeout(150)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('danach')
  await page.keyboard.press('Home')
  await insertTableViaDialog(page, 2, 2)
  await cellAt(page, 0).click()
  await page.keyboard.type('Zellkursiv')
  for (let i = 0; i < 'Zellkursiv'.length; i++) await page.keyboard.press('Shift+ArrowLeft')
  await page.getByRole('button', { name: 'Kursiv' }).click()
  await expect(editor.locator('table em')).toHaveText('Zellkursiv')
  await page.waitForTimeout(600) // Löschen als eigener Undo-Schritt

  await cellAt(page, 0).click()
  await deleteButton(page).click()
  await expect(tables(page)).toHaveCount(0)
  // äußere Formatierung unangetastet, innere restlos weg
  await expect(editor.locator('p strong')).toHaveText('fett')
  await expect(editor.locator('em')).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(tables(page)).toHaveCount(1)
  await expect(editor.locator('table em')).toHaveText('Zellkursiv') // Formatierung wiederhergestellt
  await expect(editor.locator('p strong')).toHaveText('fett')
})

// §5.2.24/DoD 11: „letzte Zeile/Spalte löschen entfernt die Tabelle" (bestehendes Feature)
// und der explizite „Tabelle löschen"-Button führen zum identischen Ergebnis.
test('Regression §2.10: letzte Zeile/Spalte löschen ≡ expliziter „Tabelle löschen"-Button', async ({ page }) => {
  await openEditor(page)

  const buildDoc = async (rows: number, cols: number) => {
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Delete')
    await page.keyboard.type('davor')
    await page.keyboard.press('Enter')
    await page.keyboard.type('danach')
    await page.keyboard.press('Home')
    await insertTableViaDialog(page, rows, cols)
    await expect(tables(page)).toHaveCount(1)
    await cellAt(page, 0).click()
  }
  const snapshot = () =>
    page.evaluate(() => {
      const root = document.querySelector('.ProseMirror')!
      return {
        tables: root.querySelectorAll('table').length,
        paragraphs: Array.from(root.querySelectorAll('p')).map((p) => p.textContent),
      }
    })

  // Weg 1: letzte (einzige) Zeile löschen → ganze Tabelle weg
  await buildDoc(1, 2)
  await page.getByRole('button', { name: 'Zeile löschen' }).click()
  await expect(tables(page)).toHaveCount(0)
  const viaRow = await snapshot()

  // Weg 2: letzte (einzige) Spalte löschen → ganze Tabelle weg
  await buildDoc(2, 1)
  await page.getByRole('button', { name: 'Spalte löschen' }).click()
  await expect(tables(page)).toHaveCount(0)
  const viaColumn = await snapshot()

  // Weg 3: expliziter Button auf derselben Struktur
  await buildDoc(1, 2)
  await deleteButton(page).click()
  await expect(tables(page)).toHaveCount(0)
  const viaButton = await snapshot()

  // Alle drei Wege enden im identischen Dokumentzustand
  expect(viaRow).toEqual(viaButton)
  expect(viaColumn).toEqual(viaButton)
})
