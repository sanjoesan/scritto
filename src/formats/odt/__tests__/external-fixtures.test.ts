import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readOdt } from '../reader'
import { assertLoadableDocument } from '../../shared/validateDocument'

const FIXTURES_DIR = join(__dirname, '../../../../tests/fixtures/external/odt')

// These fixtures are *deliberately* broken/encrypted test files from the ODF Toolkit
// corpus (used there to test its own error handling) — a thrown error is the correct,
// expected outcome, not a bug in our reader.
const KNOWN_INVALID = new Set(['invalid.odt', 'PasswordProtected.odt', 'testInvalidPkg2.odt', 'testInvalidPkg3.odt'])

// brokenList.odt (2.35 MB, ~20k automatic styles) takes 90s+ to import under Vitest's
// jsdom environment — jsdom's DOM implementation is dramatically slower than a real
// browser engine at this element count. Confirmed via a real Playwright/Chromium run
// (tests/e2e/large-document-import.spec.ts) that the actual app imports this file in
// ~0.85-0.9s, so this is a jsdom-only test artifact, not a product bug.
const SKIP_SLOW_UNDER_JSDOM = new Set(['brokenList.odt'])

function loadFixtures(): Array<{ name: string; buffer: Buffer }> {
  return readdirSync(FIXTURES_DIR).map((name) => ({ name, buffer: readFileSync(join(FIXTURES_DIR, name)) }))
}

describe('ODT reader vs. real-world fixtures (apache/tdf test corpora)', () => {
  const fixtures = loadFixtures()

  it('found the expected number of fixture files', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(50)
  })

  const results: Array<{ name: string; ok: boolean; error?: string; paragraphCount?: number }> = []

  for (const { name, buffer } of fixtures) {
    if (SKIP_SLOW_UNDER_JSDOM.has(name)) continue

    if (KNOWN_INVALID.has(name)) {
      it(`rejects deliberately invalid "${name}" with an error, not a crash/hang`, async () => {
        const blob = new Blob([new Uint8Array(buffer)])
        await expect(readOdt(blob)).rejects.toBeTruthy()
      })
      continue
    }

    // 30s per-test timeout (not the default 10s): a few fixtures (e.g. excelfileformat.odt,
    // with its embedded OLE spreadsheet) take ~5s locally under jsdom and have tipped over
    // a 10s budget on slower CI runners, even though they import correctly.
    it(
      `imports "${name}" without crashing`,
      async () => {
        try {
          const blob = new Blob([new Uint8Array(buffer)])
          const doc = await readOdt(blob)
          const paragraphCount = (doc.body as { content?: unknown[] }).content?.length ?? 0
          results.push({ name, ok: true, paragraphCount })
          expect(doc.body).toBeTruthy()
          // dokument-darstellung-req.md §4.2: every importable fixture must yield a
          // mountable, schema-valid editor document (not just a non-null body), so a
          // schema-incompatible doc can never white-screen the editor at mount time.
          expect(() => assertLoadableDocument(doc)).not.toThrow()
        } catch (err) {
          results.push({ name, ok: false, error: err instanceof Error ? err.message : String(err) })
          throw err
        }
      },
      30_000,
    )
  }

  afterAll(() => {
    const failed = results.filter((r) => !r.ok)
    const succeeded = results.filter((r) => r.ok)
    // eslint-disable-next-line no-console
    console.log(
      `\nODT fixture import summary: ${succeeded.length}/${results.length} succeeded, ${failed.length} failed.`,
    )
    if (failed.length) {
      // eslint-disable-next-line no-console
      console.log(failed.map((f) => `  - ${f.name}: ${f.error}`).join('\n'))
    }
  })
})

describe('ODT reader: hyperlink/frame/textbox content is not silently dropped (U-4)', () => {
  function loadFixture(name: string): Blob {
    const buffer = readFileSync(join(FIXTURES_DIR, name))
    return new Blob([new Uint8Array(buffer)])
  }

  it('Hyperlink-AOO401.odt: link text "Hello World!" is present', async () => {
    const doc = await readOdt(loadFixture('Hyperlink-AOO401.odt'))
    // Concatenate all text run fragments in document order and check the link text survives.
    const fragments: string[] = []
    JSON.stringify(doc.body, (key, value) => {
      if (key === 'text') fragments.push(value)
      return value
    })
    expect(fragments.join('')).toContain('Hello World!')
  })

  it('hyperlink.odt / hyperlink_destination.odt: link text survives', async () => {
    for (const name of ['hyperlink.odt', 'hyperlink_destination.odt']) {
      const doc = await readOdt(loadFixture(name))
      const fragments: string[] = []
      JSON.stringify(doc.body, (key, value) => {
        if (key === 'text') fragments.push(value)
        return value
      })
      expect(fragments.join('')).toContain('abc')
    }
  })

  it('FrameWithTable.odt: table text inside the frame/textbox is present, not an empty image', async () => {
    const doc = await readOdt(loadFixture('FrameWithTable.odt'))
    const text = JSON.stringify(doc.body)
    expect(text).toContain('unsupported_block')
    expect(text).toContain('"text":"a"')
    expect(text).not.toMatch(/"type":"image","attrs":\{"src":""/)
  })

  it('frame.odt: frame text content is present', async () => {
    const doc = await readOdt(loadFixture('frame.odt'))
    const text = JSON.stringify(doc.body)
    expect(text).toContain('Frame Content')
    expect(text).toContain('Page Content')
  })

  it('table-within-textBox-within-frame.odt: deeply nested text remains readable, no crash', async () => {
    const doc = await readOdt(loadFixture('table-within-textBox-within-frame.odt'))
    const text = JSON.stringify(doc.body)
    expect(text).toContain('CUSTOMER_NAME')
  })
})
