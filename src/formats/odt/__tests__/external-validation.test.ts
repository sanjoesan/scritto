import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { validateXML } from 'xmllint-wasm'
import { writeOdt } from '../writer'
import type { WordDocumentContent } from '../../shared/documentModel'

/**
 * External validation of writeOdt()'s output against the *official* OASIS ODF 1.3
 * RelaxNG schema, using `xmllint-wasm` (libxml2 compiled to WASM) — a parser
 * completely independent of this project's own reader (`readOdt`). This is the U10
 * test from specs/speichern-exportieren-qa.md §1.3: without this channel, the
 * roundtrip.test.ts suite only proves that `writeOdt` and `readOdt` agree with each
 * other, not that a real ODF consumer would accept the file. It's also the acceptance
 * gate named in that spec's §8: "mindestens eines externen Validierungskanals (U10
 * oder U11)".
 *
 * The schema file is the consolidated single-document RelaxNG schema OASIS publishes
 * for exactly this purpose (defines both the `office:document-content` and
 * `office:document-styles` root elements used below), fetched from
 * https://docs.oasis-open.org/office/OpenDocument/v1.3/os/schemas/OpenDocument-v1.3-schema.rng
 * and checked into the repo as a fixture (like the external POI/ODF corpora already
 * used by external-fixtures.test.ts) so this test has no network dependency at run time.
 */

const SCHEMA_PATH = join(__dirname, '../../../../tests/fixtures/external/odf-schema/OpenDocument-v1.3-schema.rng')
const SCHEMA = readFileSync(SCHEMA_PATH, 'utf-8')

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function paragraph(text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) {
  return { type: 'paragraph', attrs: { align: 'left' }, content: text ? [{ type: 'text', text, marks }] : [] }
}

async function validate(xml: string, fileName: string) {
  return validateXML({
    xml: [{ fileName, contents: xml }],
    schema: [SCHEMA],
    extension: 'relaxng',
  })
}

describe('ODT writer: external schema validation (speichern-exportieren-qa.md U10)', () => {
  it('produces a content.xml that validates against the official OASIS ODF 1.3 schema (Anforderung 5.2 minimum coverage)', async () => {
    // Deliberately combines every element speichern-exportieren-req.md §5.2 requires in
    // one document: mixed character formatting, a level-1 heading, both list types,
    // a table with a merged (colspan) cell that is *also* bold-formatted, an embedded
    // image, and umlauts/special characters in the running text.
    const content: WordDocumentContent = {
      body: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1, align: 'left' }, content: [{ type: 'text', text: 'Prüfüng äöüß' }] },
          {
            type: 'paragraph',
            attrs: { align: 'left' },
            content: [
              { type: 'text', text: 'Ein Absatz mit ' },
              { type: 'text', text: 'fett', marks: [{ type: 'strong' }] },
              { type: 'text', text: ', ' },
              { type: 'text', text: 'kursiv', marks: [{ type: 'em' }] },
              { type: 'text', text: ', ' },
              { type: 'text', text: 'unterstrichen', marks: [{ type: 'underline' }] },
              { type: 'text', text: ' und ' },
              { type: 'text', text: 'durchgestrichen', marks: [{ type: 'strike' }] },
              { type: 'text', text: '.' },
            ],
          },
          {
            type: 'bullet_list',
            content: [
              { type: 'list_item', content: [paragraph('Aufzählungspunkt 1')] },
              { type: 'list_item', content: [paragraph('Aufzählungspunkt 2')] },
            ],
          },
          {
            type: 'ordered_list',
            content: [
              { type: 'list_item', content: [paragraph('Nummerierter Punkt 1')] },
              { type: 'list_item', content: [paragraph('Nummerierter Punkt 2')] },
            ],
          },
          {
            type: 'table',
            content: [
              {
                type: 'table_row',
                content: [
                  {
                    type: 'table_cell',
                    attrs: { colspan: 2, rowspan: 1 },
                    content: [paragraph('Verbunden und fett', [{ type: 'strong' }])],
                  },
                ],
              },
              {
                type: 'table_row',
                content: [
                  { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('A2')] },
                  { type: 'table_cell', attrs: { colspan: 1, rowspan: 1 }, content: [paragraph('B2')] },
                ],
              },
            ],
          },
          { type: 'image', attrs: { src: TINY_PNG, alt: 'Diagramm' } },
        ],
      },
      header: null,
      footer: null,
      meta: { title: 'Prüfüng äöüß' },
    }

    const blob = await writeOdt(content)
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))

    const contentXml = await zip.file('content.xml')!.async('text')
    const contentResult = await validate(contentXml, 'content.xml')
    expect(
      contentResult.valid,
      `content.xml failed OASIS ODF 1.3 schema validation:\n${contentResult.errors.map((e) => e.rawMessage).join('\n')}`,
    ).toBe(true)

    const stylesXml = await zip.file('styles.xml')!.async('text')
    const stylesResult = await validate(stylesXml, 'styles.xml')
    expect(
      stylesResult.valid,
      `styles.xml failed OASIS ODF 1.3 schema validation:\n${stylesResult.errors.map((e) => e.rawMessage).join('\n')}`,
    ).toBe(true)
  }, 30_000)

  it('rejects a structurally invalid document, proving the validator actually checks structure (negative control)', async () => {
    // Sanity check for the validator/schema setup itself, so a passing result above is
    // not merely a schema/harness that accepts anything: a `table:table-cell` with a
    // non-numeric `table:number-columns-spanned` (schema type is a positive integer)
    // must be flagged.
    //
    // Note: an under-declared cell/covered-cell count relative to table:table-column
    // (the exact shape of Bug 1.5 before its fix) was tried here first and, perhaps
    // surprisingly, does *not* fail RelaxNG validation — ODF 1.3 §9.1.1's "must declare
    // as many cells as columns" rule is prose in the spec, not a structural constraint
    // the RelaxNG grammar expresses (RelaxNG has no general way to cross-reference a
    // sibling element's occurrence count). U6 in roundtrip.test.ts (counting
    // table-cell + covered-table-cell against table-column per row) remains the correct
    // check for that specific rule; this test only proves the schema/harness combination
    // is capable of rejecting *some* invalid input, i.e. isn't a no-op.
    const brokenXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ` +
      `xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ` +
      `xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
      `xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ` +
      `xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ` +
      `office:version="1.3">` +
      `<office:body><office:text>` +
      `<table:table table:name="Broken">` +
      `<table:table-column/><table:table-column/>` +
      `<table:table-row><table:table-cell table:number-columns-spanned="not-a-number"><text:p>x</text:p></table:table-cell>` +
      `<table:covered-table-cell/></table:table-row>` +
      `</table:table>` +
      `</office:text></office:body>` +
      `</office:document-content>`

    const result = await validate(brokenXml, 'broken-content.xml')
    expect(result.valid, 'validator should reject a non-numeric table:number-columns-spanned value').toBe(false)
  }, 30_000)
})
