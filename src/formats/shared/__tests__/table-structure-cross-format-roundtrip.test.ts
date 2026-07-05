import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { EditorState, TextSelection } from 'prosemirror-state'
import type { Command } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { wordSchema } from '../schema'
import type { WordDocumentContent } from '../documentModel'
import { addRowAfter, addColumnAfter, deleteColumnOrTable } from '../editor/commands'
import { writeDocx } from '../../docx/writer'
import { readDocx } from '../../docx/reader'
import { writeOdt } from '../../odt/writer'
import { readOdt } from '../../odt/reader'

// Cross-format adapter round trip (req §4.3) + independent raw-XML verification (req §4:
// "über einen unabhängigen Parser bzw. Roh-XML-Assertion, nicht nur über den eigenen
// Reader") + real foreign-file fixtures (req §3 Nr. 18). The app has no export-format
// picker, so cross-format is only reachable at this adapter level (readX → op → writeY →
// readY), which this file exercises in both directions.

/* eslint-disable @typescript-eslint/no-explicit-any */

function para(text?: string): PMNode {
  return wordSchema.node('paragraph', null, text ? [wordSchema.text(text)] : [])
}
function cell(text?: string, attrs?: Record<string, unknown>): PMNode {
  return wordSchema.node('table_cell', attrs ?? null, [para(text)])
}
function trow(...cells: PMNode[]): PMNode {
  return wordSchema.node('table_row', null, cells)
}
function table(...rows: PMNode[]): PMNode {
  return wordSchema.node('table', null, rows)
}
function content(...blocks: PMNode[]): WordDocumentContent {
  return { body: wordSchema.node('doc', null, blocks).toJSON(), header: null, footer: null, meta: { title: '' } }
}

/** Applies a command with the cursor in the first cell of the first table in `content`. */
function applyOp(input: WordDocumentContent, command: Command): WordDocumentContent {
  const doc = wordSchema.nodeFromJSON(input.body)
  let state = EditorState.create({ doc, schema: wordSchema })
  let tablePos = -1
  state.doc.descendants((node, pos) => {
    if (tablePos === -1 && node.type.name === 'table') tablePos = pos
    return tablePos === -1
  })
  if (tablePos < 0) throw new Error('no table found in content')
  state = state.apply(state.tr.setSelection(TextSelection.near(state.doc.resolve(tablePos + 3))))
  let next = state
  command(state, (tr) => {
    next = state.apply(tr)
  })
  return { ...input, body: next.doc.toJSON() }
}

function firstTable(c: WordDocumentContent): any {
  return (c.body as any).content.find((n: any) => n.type === 'table')
}
function rowCount(c: WordDocumentContent): number {
  const t = firstTable(c)
  return t ? t.content.length : 0
}
function count(haystack: string, needle: RegExp): number {
  return (haystack.match(needle) ?? []).length
}
async function docxXml(c: WordDocumentContent): Promise<string> {
  const zip = await JSZip.loadAsync(await writeDocx(c))
  return zip.file('word/document.xml')!.async('text')
}
async function odtXml(c: WordDocumentContent): Promise<string> {
  const zip = await JSZip.loadAsync(await writeOdt(c))
  return zip.file('content.xml')!.async('text')
}

describe('table structure: cross-format adapter round trip (req §4.3)', () => {
  const simple = () => content(table(trow(cell('A1'), cell('B1')), trow(cell('A2'), cell('B2'))))

  it('DOCX-origin → insert row → export ODT → reimport keeps the new row (3 rows)', async () => {
    const fromDocx = await readDocx(await writeDocx(simple())) // originated as DOCX
    const afterOp = applyOp(fromDocx, addRowAfter)
    const viaOdt = await readOdt(await writeOdt(afterOp))
    expect(rowCount(viaOdt)).toBe(3)
  })

  it('ODT-origin → insert row → export DOCX → reimport keeps the new row (3 rows)', async () => {
    const fromOdt = await readOdt(await writeOdt(simple())) // originated as ODT
    const afterOp = applyOp(fromOdt, addRowAfter)
    const viaDocx = await readDocx(await writeDocx(afterOp))
    expect(rowCount(viaDocx)).toBe(3)
  })

  it('DOCX-origin → delete column → export ODT → reimport keeps one column, no structure loss', async () => {
    const fromDocx = await readDocx(await writeDocx(simple()))
    const afterOp = applyOp(fromDocx, deleteColumnOrTable())
    const viaOdt = await readOdt(await writeOdt(afterOp))
    expect(firstTable(viaOdt).content[0].content).toHaveLength(1)
  })
})

describe('table structure: independent raw-XML verification (req §4)', () => {
  it('DOCX document.xml has the expected raw <w:tr> row count after inserting a row', async () => {
    const c = applyOp(content(table(trow(cell('a'), cell('b')), trow(cell('c'), cell('d')))), addRowAfter)
    const xml = await docxXml(c)
    expect(count(xml, /<w:tr[\s>]/g)).toBe(3)
  })

  it('ODT content.xml has the expected raw <table:table-row> count after inserting a row', async () => {
    const c = applyOp(content(table(trow(cell('a'), cell('b')), trow(cell('c'), cell('d')))), addRowAfter)
    const xml = await odtXml(c)
    expect(count(xml, /<table:table-row[\s>]/g)).toBe(3)
  })

  it('a colspan cell survives an inserted column as a real merge in DOCX raw XML (<w:gridSpan>)', async () => {
    // colspan:2 in row 0, two cells in row 1; insert a column → grid widens, merge intact.
    const c = applyOp(content(table(trow(cell('span', { colspan: 2 })), trow(cell('a'), cell('b')))), addColumnAfter)
    const xml = await docxXml(c)
    expect(count(xml, /<w:gridSpan\b/g)).toBeGreaterThanOrEqual(1) // merge preserved, not flattened
    expect(count(xml, /<w:gridCol\b/g)).toBe(3) // effective column count grew to 3
  })

  it('a rowspan cell survives an inserted row as a real vertical merge in DOCX raw XML (<w:vMerge>)', async () => {
    // 'Tall' spans rows 0–1; insert a row below → grid stays consistent, vMerge present.
    const c = applyOp(
      content(table(trow(cell('Tall', { rowspan: 2 }), cell('r0c1')), trow(cell('r1c1')))),
      addRowAfter,
    )
    const xml = await docxXml(c)
    expect(count(xml, /<w:vMerge\b/g)).toBeGreaterThanOrEqual(1)
  })

  it('a rowspan cell survives in ODT raw XML as a covered-table-cell placeholder', async () => {
    const c = content(table(trow(cell('Tall', { rowspan: 2 }), cell('r0c1')), trow(cell('r1c1'))))
    const xml = await odtXml(c)
    expect(count(xml, /<table:covered-table-cell\b/g)).toBeGreaterThanOrEqual(1)
  })
})

describe('table structure: real foreign-file fixtures (req §3 Nr. 18)', () => {
  const ODT_DIR = join(__dirname, '../../../../tests/fixtures/external/odt')
  const fixtures = ['tableCoveredContent.odt', 'tableRowDeletionTest.odt', 'table-column-delete-with-merge.odt']

  for (const name of fixtures) {
    it(`${name}: inserting a row then exporting/reimporting does not crash or corrupt the table`, async () => {
      const buffer = readFileSync(join(ODT_DIR, name))
      const imported = await readOdt(new Blob([new Uint8Array(buffer)]))
      const before = rowCount(imported)
      expect(before).toBeGreaterThan(0) // fixture really has a table
      const afterOp = applyOp(imported, addRowAfter)
      const reimported = await readOdt(await writeOdt(afterOp))
      // structure survives export/reimport and grew by exactly the inserted row
      expect(rowCount(reimported)).toBe(before + 1)
    })
  }
})
