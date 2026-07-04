import { test, expect } from '@playwright/test'
import JSZip from 'jszip'

// specs/kopieren-qa.md Abschnitt 2.2: proves that content produced by copy/paste
// inside the editor survives the same export/re-import round trip as regularly
// typed content (kopieren-req.md Abschnitt 4). Structure mirrors docx.spec.ts/
// odt.spec.ts: build a document, export it, actually open the downloaded file
// and check its real XML content — not just the DOM before export.

function odtCard(page: import('@playwright/test').Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'OpenDocument Text (.odt)' }) })
}
function docxCard(page: import('@playwright/test').Page) {
  return page.locator('div.rounded-lg', { has: page.getByRole('heading', { name: 'Word-Dokument (.docx)' }) })
}

async function settle(page: import('@playwright/test').Page) {
  await page.waitForTimeout(50)
}

test.describe('Kopieren + Datei-Rundreise', () => {
  test.beforeEach(async ({ page, context, browserName }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    }
    page.on('dialog', (dialog) => dialog.accept())
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
  })

  test('R-1 (DOCX): copy/paste of a composed document, then export, then verify the downloaded file', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit clipboard-Berechtigungen erlauben in Playwright keinen zuverlässigen Kopieren→Einfügen-Rundlauf per Tastenkürzel.')
    await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
    const editor = page.locator('.ProseMirror')
    await editor.click()

    // Ausgangsdokument mit Überschrift, formatiertem Absatz aufbauen.
    await page.getByLabel('Absatzformat').selectOption('1')
    await page.keyboard.type('Bericht')
    await page.keyboard.press('End')
    await settle(page)
    await page.keyboard.press('Enter')
    await page.getByLabel('Absatzformat').selectOption('normal')
    await page.keyboard.type('Formatierter Text.')
    await page.keyboard.press('Home')
    await settle(page)
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight', { delay: 20 })
    await page.keyboard.up('Shift')
    await settle(page)
    await page.getByTitle('Fett').click()

    // Alles markieren, kopieren, in ein zweites, neues leeres Dokument einfügen (kopieren-req.md Abschnitt 4, Testfall 3).
    await page.keyboard.press('ControlOrMeta+End')
    await settle(page)
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ControlOrMeta+c')

    await page.getByRole('button', { name: '← Formate' }).click()
    await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('ControlOrMeta+v')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile((await download.path())!)
    const zip = await JSZip.loadAsync(exportedBuffer)
    const documentXml = await zip.file('word/document.xml')!.async('text')
    // Bolding only the first letter splits "Formatierter Text." across two
    // adjacent <w:t> runs ("F" + "ormatierter Text.") — strip tags before
    // checking for the sentence so the assertion is about the text content,
    // not incidental run-splitting caused by the deliberately partial-bold
    // selection above.
    const plainText = documentXml.replace(/<[^>]+>/g, '')

    expect(plainText).toContain('Bericht')
    expect(plainText).toContain('Formatierter Text.')
    expect(documentXml).toContain('<w:b/>')
    expect(documentXml).toMatch(/Heading1|w:pStyle/)
  })

  test('R-2 (ODT): same composed-document copy/paste, exported as ODT', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit clipboard-Berechtigungen erlauben in Playwright keinen zuverlässigen Kopieren→Einfügen-Rundlauf per Tastenkürzel.')
    await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
    const editor = page.locator('.ProseMirror')
    await editor.click()

    await page.getByLabel('Absatzformat').selectOption('1')
    await page.keyboard.type('Bericht')
    await page.keyboard.press('End')
    await settle(page)
    await page.keyboard.press('Enter')
    await page.getByLabel('Absatzformat').selectOption('normal')
    await page.keyboard.type('Formatierter Text.')
    await page.keyboard.press('Home')
    await settle(page)
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight', { delay: 20 })
    await page.keyboard.up('Shift')
    await settle(page)
    await page.getByTitle('Fett').click()

    await page.keyboard.press('ControlOrMeta+End')
    await settle(page)
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ControlOrMeta+c')

    await page.getByRole('button', { name: '← Formate' }).click()
    await odtCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('ControlOrMeta+v')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportieren' }).click()
    const download = await downloadPromise
    const fs = await import('node:fs/promises')
    const exportedBuffer = await fs.readFile((await download.path())!)
    const zip = await JSZip.loadAsync(exportedBuffer)
    const contentXml = await zip.file('content.xml')!.async('text')

    // Same run-splitting note as R-1 above (ODT: <text:span> instead of <w:t>).
    const plainText = contentXml.replace(/<[^>]+>/g, '')

    expect(plainText).toContain('Bericht')
    expect(plainText).toContain('Formatierter Text.')
    // ODT's actual bold representation: a named automatic text style with
    // fo:font-weight="bold" (ODF §16.27.6), not inline CSS-like syntax.
    expect(contentXml).toMatch(/fo:font-weight="bold"/)
    expect(contentXml).toMatch(/text:h/)
  })

  test.fixme(
    'R-3 (Cross-Format DOCX→ODT): blocked — no export-format picker exists yet, see kopieren-code.md Abschnitt 0.4/9',
    async () => {},
  )

  test.fixme(
    'R-4 (Cross-Format ODT→DOCX): blocked, same reason as R-3',
    async () => {},
  )

  test.fixme(
    'R-5 (double cross-format round trip DOCX→ODT→DOCX): blocked, same reason as R-3',
    async () => {},
  )

  test('R-6: clipboard survives closing document A and opening a fresh document B', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit clipboard-Berechtigungen erlauben in Playwright keinen zuverlässigen Kopieren→Einfügen-Rundlauf per Tastenkürzel.')
    // kopieren-req.md Abschnitt 4, Testfall 6 — die App zeigt jeweils ein aktives
    // Dokument; "zwei gleichzeitig geöffnete Dokumente" ist architektonisch nicht
    // vorgesehen (kopieren-code.md Abschnitt 6.3, Punkt 6). Getestet wird deshalb der
    // dokumentierte Ersatzweg: schließen + neu öffnen, Systemzwischenablage bleibt bestehen.
    await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.type('Inhalt aus Dokument A')
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ControlOrMeta+c')

    await page.getByRole('button', { name: '← Formate' }).click()
    await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
    await page.locator('.ProseMirror').click()
    await page.keyboard.press('ControlOrMeta+v')

    await expect(page.locator('.ProseMirror')).toContainText('Inhalt aus Dokument A')
  })
})

// ---------------------------------------------------------------------------
// R-7: parametrized round trip — kopieren-req.md Abschnitt 4, Testfall 1/7:
// "für jede Zeile aus Abschnitt 2.2: Kopieren/Einfügen -> Export DOCX ->
// Re-Import -> Merkmal erhalten", as a single combined copy/paste + export
// scenario per row (kopieren-qa.md Abschnitt 2.2's "vollständige
// Parametrisierung ist Teil der Implementierung dieses Testplans").
// ---------------------------------------------------------------------------

type FeatureCase = {
  name: string
  build: (page: import('@playwright/test').Page) => Promise<void>
  expectedXml: RegExp | string
}

const FEATURE_CASES: FeatureCase[] = [
  {
    name: 'Kursiv',
    build: async (page) => {
      await page.keyboard.type('kursiverText')
      await page.keyboard.press('ControlOrMeta+a')
      await page.getByTitle('Kursiv').click()
    },
    expectedXml: '<w:i/>',
  },
  {
    name: 'Unterstrichen',
    build: async (page) => {
      await page.keyboard.type('unterstrichenerText')
      await page.keyboard.press('ControlOrMeta+a')
      await page.getByTitle('Unterstrichen').click()
    },
    expectedXml: '<w:u ',
  },
  {
    name: 'Durchgestrichen',
    build: async (page) => {
      await page.keyboard.type('durchgestrichenerText')
      await page.keyboard.press('ControlOrMeta+a')
      await page.getByTitle('Durchgestrichen').click()
    },
    expectedXml: '<w:strike/>',
  },
  {
    name: 'Bullet-Liste',
    build: async (page) => {
      await page.getByTitle('Aufzählung').click()
      await page.keyboard.type('Listenpunkt eins')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Listenpunkt zwei')
      await page.keyboard.press('ControlOrMeta+a')
    },
    expectedXml: /numPr|w:numId/,
  },
  {
    name: 'Nummerierte Liste',
    build: async (page) => {
      await page.getByTitle('Nummerierte Liste').click()
      await page.keyboard.type('Schritt eins')
      await page.keyboard.press('ControlOrMeta+a')
    },
    expectedXml: /numPr|w:numId/,
  },
]

// "Tab-Zeichen im Fließtext" (kopieren-req.md Abschnitt 2.2 table, last row) is
// deliberately NOT in FEATURE_CASES above: verified empirically (see QA notes)
// that pressing `Tab` while focused in `.ProseMirror` moves DOM focus to the
// next focusable element instead of inserting a literal tab character — there
// is no keymap binding or toolbar action that inserts a `\t` from the keyboard
// in the current UI (same class of gap `insertHardBreak`/Shift-Enter closed
// for hard_break, just not yet closed for tab). A genuine `page.keyboard`-only
// E2E for "copy a tab character" is therefore not implementable against the
// current UI without first adding such a binding — that is a product gap to
// flag back to kopieren-req.md/kopieren-code.md, not a test-writing gap. Tab
// round-trip fidelity at the data-model level remains covered by
// src/formats/docx/__tests__/roundtrip.test.ts's "preserves runs of multiple
// spaces and tab characters".
test.fixme(
  'Tab-Zeichen: kopieren/einfügen bleibt nach DOCX-Export erhalten — blocked, kein Weg, ein Tab-Zeichen über die Tastatur in den Editor einzufügen (Tab wechselt den Fokus statt ein \\t einzufügen)',
  async () => {},
)

test.describe('R-7: parametrisierte Kopieren/Einfügen + DOCX-Export-Rundreise je Merkmal aus kopieren-req.md Abschnitt 2.2', () => {
  test.beforeEach(async ({ page, context, browserName }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    }
    page.on('dialog', (dialog) => dialog.accept())
    await page.goto('/')
    await page.getByRole('button', { name: /verstanden/i }).click()
  })

  for (const feature of FEATURE_CASES) {
    test(`${feature.name}: kopieren/einfügen bleibt nach DOCX-Export erhalten`, async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'WebKit clipboard-Berechtigungen erlauben in Playwright keinen zuverlässigen Kopieren→Einfügen-Rundlauf per Tastenkürzel.')
      await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
      const editor = page.locator('.ProseMirror')
      await editor.click()
      await feature.build(page)
      await page.keyboard.press('ControlOrMeta+c')

      await page.getByRole('button', { name: '← Formate' }).click()
      await docxCard(page).getByRole('button', { name: 'Neu erstellen' }).click()
      await page.locator('.ProseMirror').click()
      await page.keyboard.press('ControlOrMeta+v')

      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Exportieren' }).click()
      const download = await downloadPromise
      const fs = await import('node:fs/promises')
      const exportedBuffer = await fs.readFile((await download.path())!)
      const zip = await JSZip.loadAsync(exportedBuffer)
      const documentXml = await zip.file('word/document.xml')!.async('text')

      if (typeof feature.expectedXml === 'string') {
        expect(documentXml).toContain(feature.expectedXml)
      } else {
        expect(documentXml).toMatch(feature.expectedXml)
      }
    })
  }
})
