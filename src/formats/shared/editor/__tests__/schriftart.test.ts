import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { EditorState, TextSelection } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { wordSchema } from '../../schema'
import { activeFontFamily, applyFontFamily, clearFontFamily } from '../commands'
import { cssFontFamily, firstConcreteFamily, genericFallbackFor, stripSymmetricQuotes } from '../fonts'
import { writeDocx } from '../../../docx/writer'
import { readDocx } from '../../../docx/reader'
import { writeOdt } from '../../../odt/writer'
import { readOdt } from '../../../odt/reader'
import type { WordDocumentContent } from '../../documentModel'

// Scheibe 1 von specs/schriftart-waehlen-req.md: Datenmodell + beide Formatpfade
// (Combobox-UI folgt als eigene Scheibe). Deckt §2.2, §2.7–§2.9, Grenzfälle
// 3.13/3.14/3.22/3.25 und die Rundreisen ab.

const font = (family: string) => wordSchema.marks.fontFamily.create({ family })

function para(...children: PMNode[]): PMNode {
  return wordSchema.node('paragraph', null, children)
}
function docState(...blocks: PMNode[]): EditorState {
  return EditorState.create({ doc: wordSchema.node('doc', null, blocks), schema: wordSchema })
}
function withCursor(state: EditorState, pos: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
}
function withRange(state: EditorState, from: number, to: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
}

describe('fonts.ts Hilfsfunktionen (§2.6/§2.7, Grenzfälle 3.22/3.25)', () => {
  it('cssFontFamily quotet immer und hängt den passenden generischen Fallback an', () => {
    expect(cssFontFamily('Times New Roman')).toBe('"Times New Roman", serif')
    expect(cssFontFamily('Courier New')).toBe('"Courier New", monospace')
    expect(cssFontFamily('Arial')).toBe('"Arial", sans-serif')
  })
  it('CSS-signifikante Zeichen im Namen brechen die Deklaration nicht auf (3.22)', () => {
    expect(cssFontFamily('Böse "Schrift", GmbH')).toBe('"Böse \\"Schrift\\", GmbH", sans-serif')
  })
  it('genericFallbackFor: Heuristik für unkuratierte Namen', () => {
    expect(genericFallbackFor('Fira Mono')).toBe('monospace')
    expect(genericFallbackFor('Garamond Premier')).toBe('serif')
    expect(genericFallbackFor('Firmenschrift 2000')).toBe('sans-serif')
  })
  it('firstConcreteFamily: erster konkreter Name aus einem CSS-Stack, generics übersprungen', () => {
    expect(firstConcreteFamily('"Segoe UI", system-ui, sans-serif')).toBe('Segoe UI')
    expect(firstConcreteFamily("'Times New Roman', serif")).toBe('Times New Roman')
    expect(firstConcreteFamily('sans-serif')).toBeNull()
  })
  it('stripSymmetricQuotes: nur ein SYMMETRISCHES Randpaar wird entfernt (3.25)', () => {
    expect(stripSymmetricQuotes("'Andale Sans UI'")).toBe('Andale Sans UI')
    expect(stripSymmetricQuotes('"Times New Roman"')).toBe('Times New Roman')
    expect(stripSymmetricQuotes("D'Nealian Script")).toBe("D'Nealian Script")
    expect(stripSymmetricQuotes("Endet mit'")).toBe("Endet mit'")
  })
})

describe('Commands (§2.2, Grenzfall 3.16)', () => {
  it('Selektion: gesamte Range bekommt den Mark; activeFontFamily zeigt ihn', () => {
    const state = withRange(docState(para(wordSchema.text('abcd'))), 1, 5)
    let next = state
    expect(applyFontFamily('Georgia')(state, (tr) => (next = state.apply(tr)))).toBe(true)
    expect(activeFontFamily(withRange(next, 1, 5))).toBe('Georgia')
  })

  it('Schreibmarke: storedMark (kein No-Op, §2.2)', () => {
    const state = withCursor(docState(para(wordSchema.text('text'))), 3)
    let next = state
    applyFontFamily('Verdana')(state, (tr) => (next = state.apply(tr)))
    expect(next.storedMarks?.some((m) => m.type.name === 'fontFamily')).toBe(true)
    expect(activeFontFamily(next)).toBe('Verdana')
  })

  it('leerer Name → false, nichts passiert (3.16)', () => {
    const state = withCursor(docState(para(wordSchema.text('text'))), 3)
    expect(applyFontFamily('   ')(state, () => {})).toBe(false)
  })

  it('markloser Text → null (KEIN erfundener Default, §2.4); gemischt → "mixed"', () => {
    const plain = withCursor(docState(para(wordSchema.text('ohne'))), 3)
    expect(activeFontFamily(plain)).toBeNull()
    const mixed = withRange(docState(para(wordSchema.text('aa', [font('Arial')]), wordSchema.text('bb'))), 1, 5)
    expect(activeFontFamily(mixed)).toBe('mixed')
  })

  it('clearFontFamily entfernt nur den Schriftart-Mark', () => {
    const strong = wordSchema.marks.strong.create()
    const state = withRange(docState(para(wordSchema.text('ab', [strong, font('Tahoma')]))), 1, 3)
    let next = state
    clearFontFamily()(state, (tr) => (next = state.apply(tr)))
    const marks = next.doc.resolve(2).marks()
    expect(marks.some((m) => m.type.name === 'fontFamily')).toBe(false)
    expect(marks.some((m) => m.type.name === 'strong')).toBe(true)
  })
})

describe('Rundreisen (§6) und Format-Kodierung (§2.8/§2.9)', () => {
  function doc(content: unknown[]): WordDocumentContent {
    return { body: { type: 'doc', content }, header: null, footer: null, meta: { title: '' } }
  }
  const withFont = (text: string, family: string) => ({
    type: 'paragraph',
    attrs: { align: 'left' },
    content: [{ type: 'text', text, marks: [{ type: 'fontFamily', attrs: { family } }] }],
  })
  function firstFamily(result: WordDocumentContent): string | undefined {
    const para = (result.body as { content: Array<{ content?: Array<{ marks?: Array<{ type: string; attrs?: { family?: string } }> }> }> }).content[0]
    return para.content?.[0]?.marks?.find((m) => m.type === 'fontFamily')?.attrs?.family
  }

  it('DOCX: alle vier w:rFonts-Attribute konsistent, Name exakt zurückgelesen', async () => {
    const blob = await writeDocx(doc([withFont('text', 'Times New Roman')]))
    const xml = await (await JSZip.loadAsync(blob)).file('word/document.xml')!.async('text')
    expect(xml).toContain(
      '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>',
    )
    expect(firstFamily(await readDocx(blob))).toBe('Times New Roman')
  })

  it('DOCX-Reader: w:hAnsi als Fallback; nur w:eastAsia → bewusst KEIN Mark (3.14)', async () => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const build = async (rFonts: string) => {
      const zip = new JSZip()
      zip.file(
        '[Content_Types].xml',
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      )
      zip.folder('_rels')!.file(
        '.rels',
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      )
      zip.folder('word')!.file(
        'document.xml',
        `<?xml version="1.0"?><w:document xmlns:w="${W}"><w:body><w:p><w:r><w:rPr>${rFonts}</w:rPr><w:t>x</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
      )
      return readDocx(await zip.generateAsync({ type: 'blob' }))
    }
    expect(firstFamily(await build('<w:rFonts w:hAnsi="Calibri"/>'))).toBe('Calibri')
    expect(firstFamily(await build('<w:rFonts w:eastAsia="MS Mincho"/>'))).toBeUndefined()
  })

  it('ODT: Doppelverankerung — style:font-name UND deduplizierter font-face-decls-Eintrag (§2.9)', async () => {
    const blob = await writeOdt(doc([withFont('eins', 'Georgia'), withFont('zwei', 'Georgia')]))
    const xml = await (await JSZip.loadAsync(blob)).file('content.xml')!.async('text')
    expect(xml).toContain('style:font-name="Georgia"')
    expect(xml.match(/<style:font-face /g)).toHaveLength(1) // dedupliziert
    expect(xml).toContain('<style:font-face style:name="Georgia" svg:font-family="Georgia"/>')
    // font-face-decls stehen VOR den automatic-styles (ODF-Reihenfolge)
    expect(xml.indexOf('office:font-face-decls')).toBeLessThan(xml.indexOf('office:automatic-styles'))
    expect(firstFamily(await readOdt(blob))).toBe('Georgia')
  })

  it('ODT: mehrteiliger Name wird LO-üblich mit Apostrophen deklariert und exakt zurückgelesen', async () => {
    const blob = await writeOdt(doc([withFont('text', 'Times New Roman')]))
    const xml = await (await JSZip.loadAsync(blob)).file('content.xml')!.async('text')
    expect(xml).toContain(`svg:font-family="&apos;Times New Roman&apos;"`)
    expect(firstFamily(await readOdt(blob))).toBe('Times New Roman')
  })

  it('Sonderzeichen-Name übersteht beide Rundreisen verlustfrei (3.22)', async () => {
    const family = 'Böse "Schrift" & Co'
    expect(firstFamily(await readDocx(await writeDocx(doc([withFont('x', family)]))))).toBe(family)
    expect(firstFamily(await readOdt(await writeOdt(doc([withFont('x', family)]))))).toBe(family)
  })

  it('reale Fixture FruitDepot-SeasonalFruits5.odt: literal gequotete svg:font-family-Namen kommen OHNE Apostrophe an (3.25)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const buffer = readFileSync(join(__dirname, '../../../../../tests/fixtures/external/odt/FruitDepot-SeasonalFruits5.odt'))
    const result = await readOdt(buffer as unknown as Blob)
    const families = new Set<string>()
    const visit = (node: { marks?: Array<{ type: string; attrs?: { family?: string } }>; content?: unknown[] }) => {
      node.marks?.forEach((m) => {
        if (m.type === 'fontFamily' && m.attrs?.family) families.add(m.attrs.family)
      })
      ;(node.content as Array<Record<string, unknown>> | undefined)?.forEach((c) => visit(c as never))
    }
    ;(result.body as { content: Array<Record<string, unknown>> }).content.forEach((n) => visit(n as never))
    for (const family of families) {
      expect(family.startsWith("'"), `"${family}" darf nicht mit Apostroph beginnen`).toBe(false)
      expect(family.endsWith("'"), `"${family}" darf nicht mit Apostroph enden`).toBe(false)
    }
  })
})
