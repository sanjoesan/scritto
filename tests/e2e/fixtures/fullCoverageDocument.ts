import JSZip from 'jszip'
import { TINY_PNG_BUFFER } from './richDocument'

/**
 * The single, hand-built test file per format that specs/speichern-exportieren-req.md
 * §5.2 requires ("Mindestabdeckung der Testdatei(en)") — every one of the following
 * combined in ONE document, exercised by ONE real-browser round-trip test
 * (upload -> unchanged export -> re-upload) per format in docx.spec.ts/odt.spec.ts:
 *   - several paragraphs with mixed character formatting: bold, italic, underline,
 *     strikethrough, font color, highlight,
 *   - at least one heading ("Heading 1"/outline-level 1),
 *   - one bullet list AND one separate numbered/ordered list,
 *   - a table with multiple rows/columns and at least one cell that is BOTH merged
 *     (colspan) AND formatted (bold + font color),
 *   - at least one embedded image,
 *   - umlauts/special characters in the running text (the filename itself is chosen by
 *     the test that uploads this buffer, see FULL_COVERAGE_DOCX_FILENAME/
 *     FULL_COVERAGE_ODT_FILENAME below).
 *
 * Built independently of this app's own writer.ts/reader.ts (raw XML/ZIP), exactly like
 * fixtures/richDocument.ts, so the round trip actually exercises the reader against
 * real, foreign-authored OOXML/ODF rather than content the app's own writer already
 * knows how to produce.
 */

export const FULL_COVERAGE_DOCX_FILENAME = 'Bewerbung Müller (Entwurf).docx'
export const FULL_COVERAGE_ODT_FILENAME = 'Bewerbung Müller (Entwurf).odt'
export const FULL_COVERAGE_TITLE = 'Prüfungsdokument'
export const FULL_COVERAGE_HEADING_TEXT = 'Überschrift für die Prüfung'
export const FULL_COVERAGE_BULLET_ITEMS = ['Erster Aufzählungspunkt', 'Zweiter Aufzählungspunkt']
export const FULL_COVERAGE_ORDERED_ITEMS = ['Erster Schritt', 'Zweiter Schritt']
export const FULL_COVERAGE_MERGED_CELL_TEXT = 'Verbunden und formatiert'
export const FULL_COVERAGE_UMLAUT_TEXT = 'Prüfung äöüß Größe'

export async function buildFullCoverageDocx(): Promise<Buffer> {
  const zip = new JSZip()

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `</Types>`,
  )
  zip
    .folder('_rels')!
    .file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`,
    )
  zip
    .folder('docProps')!
    .file(
      'core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${FULL_COVERAGE_TITLE}</dc:title></cp:coreProperties>`,
    )

  const word = zip.folder('word')!
  word.folder('media')!.file('image1.png', TINY_PNG_BUFFER)

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  const WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
  const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
  const PIC = 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
  const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

  const heading = `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${FULL_COVERAGE_HEADING_TEXT}</w:t></w:r></w:p>`

  // One flat bullet list (numId=1) and one separate, non-nested numbered list
  // (numId=2) — deliberately two distinct top-level lists, not one two-level nested
  // list (that combination is already covered by fixtures/richDocument.ts for the
  // "datei-oeffnen" feature; §5.2 here specifically asks for "eine Aufzählungsliste UND
  // eine nummerierte Liste").
  const bulletList = FULL_COVERAGE_BULLET_ITEMS.map(
    (text) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`,
  ).join('')
  const orderedList = FULL_COVERAGE_ORDERED_ITEMS.map(
    (text) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`,
  ).join('')

  // A 2x2 table whose top row is a single cell that is BOTH merged (gridSpan=2) AND
  // formatted (bold + font color) — §5.2 "Tabelle ... mit mind. einer formatierten
  // Zelle" combined with the merge requirement in one cell, the strictest reading.
  const table =
    `<w:tbl><w:tblPr/><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>` +
    `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:rPr><w:b/><w:color w:val="1F4E79"/></w:rPr><w:t>${FULL_COVERAGE_MERGED_CELL_TEXT}</w:t></w:r></w:p></w:tc></w:tr>` +
    `<w:tr><w:tc><w:p><w:r><w:t>Zelle A2</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Zelle B2</w:t></w:r></w:p></w:tc></w:tr>` +
    `</w:tbl>`

  const image =
    `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="304800" cy="228600"/><wp:docPr id="1" name="Testbild"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Testbild"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="304800" cy="228600"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`

  // Mixed character formatting: bold, italic, underline, strikethrough, font color,
  // highlight — each its own run so every mark can be asserted independently. Plus a
  // separate paragraph with umlauts/special characters in the running text (§5.2 last
  // bullet, "im Fließtext").
  const mixedFormatting =
    `<w:p>` +
    `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Fett </w:t></w:r>` +
    `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">Kursiv </w:t></w:r>` +
    `<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">Unterstrichen </w:t></w:r>` +
    `<w:r><w:rPr><w:strike/></w:rPr><w:t xml:space="preserve">Durchgestrichen </w:t></w:r>` +
    `<w:r><w:rPr><w:color w:val="C00000"/></w:rPr><w:t xml:space="preserve">Farbig </w:t></w:r>` +
    `<w:r><w:rPr><w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/></w:rPr><w:t>Hervorgehoben</w:t></w:r>` +
    `</w:p>` +
    `<w:p><w:r><w:t>${FULL_COVERAGE_UMLAUT_TEXT}</w:t></w:r></w:p>`

  const numberingXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:numbering ${W}>` +
    `<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>` +
    `<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>` +
    `</w:numbering>`
  word.file('numbering.xml', numberingXml)
  word
    .folder('_rels')!
    .file(
      'document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>` +
        `</Relationships>`,
    )

  word.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document ${W} ${WP} ${A} ${PIC} ${R}><w:body>` +
      heading +
      bulletList +
      orderedList +
      table +
      image +
      mixedFormatting +
      `<w:sectPr/>` +
      `</w:body></w:document>`,
  )

  return zip.generateAsync({ type: 'nodebuffer' })
}

export async function buildFullCoverageOdt(): Promise<Buffer> {
  const zip = new JSZip()
  const NS =
    `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ` +
    `xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ` +
    `xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"`

  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.folder('Pictures')!.file('image1.png', TINY_PNG_BUFFER)

  const automaticStyles =
    `<style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>` +
    `<style:style style:name="Italic" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>` +
    `<style:style style:name="Underline" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-type="single"/></style:style>` +
    `<style:style style:name="Strike" style:family="text"><style:text-properties style:text-line-through-style="solid"/></style:style>` +
    `<style:style style:name="Colored" style:family="text"><style:text-properties fo:color="#C00000"/></style:style>` +
    `<style:style style:name="Highlighted" style:family="text"><style:text-properties fo:background-color="#FFFF00"/></style:style>` +
    `<style:style style:name="BoldColored" style:family="text"><style:text-properties fo:font-weight="bold" fo:color="#1F4E79"/></style:style>` +
    // Two separate list styles — one bullet, one numbered — mirrors the DOCX fixture's
    // two distinct top-level lists (not nested).
    `<text:list-style style:name="BulletList"><text:list-level-style-bullet text:level="1" text:bullet-char="•"/></text:list-style>` +
    `<text:list-style style:name="NumberList"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."/></text:list-style>`

  const heading = `<text:h text:outline-level="1">${FULL_COVERAGE_HEADING_TEXT}</text:h>`

  const bulletList =
    `<text:list text:style-name="BulletList">` +
    FULL_COVERAGE_BULLET_ITEMS.map((text) => `<text:list-item><text:p>${text}</text:p></text:list-item>`).join('') +
    `</text:list>`
  const orderedList =
    `<text:list text:style-name="NumberList">` +
    FULL_COVERAGE_ORDERED_ITEMS.map((text) => `<text:list-item><text:p>${text}</text:p></text:list-item>`).join('') +
    `</text:list>`

  // A 2x2 table whose top row is a single cell that is BOTH merged
  // (number-columns-spanned=2) AND formatted (bold + font color span inside), with the
  // required ODF 1.3 §9.1.1 covered-table-cell placeholder alongside it.
  const table =
    `<table:table table:name="CoverageTable"><table:table-column/><table:table-column/>` +
    `<table:table-row><table:table-cell table:number-columns-spanned="2"><text:p><text:span text:style-name="BoldColored">${FULL_COVERAGE_MERGED_CELL_TEXT}</text:span></text:p></table:table-cell><table:covered-table-cell/></table:table-row>` +
    `<table:table-row><table:table-cell><text:p>Zelle A2</text:p></table:table-cell><table:table-cell><text:p>Zelle B2</text:p></table:table-cell></table:table-row>` +
    `</table:table>`

  const image =
    `<text:p><draw:frame draw:name="Testbild" svg:width="0.8cm" svg:height="0.6cm"><draw:image xlink:href="Pictures/image1.png"/></draw:frame></text:p>`

  const mixedFormatting =
    `<text:p>` +
    `<text:span text:style-name="Bold">Fett </text:span>` +
    `<text:span text:style-name="Italic">Kursiv </text:span>` +
    `<text:span text:style-name="Underline">Unterstrichen </text:span>` +
    `<text:span text:style-name="Strike">Durchgestrichen </text:span>` +
    `<text:span text:style-name="Colored">Farbig </text:span>` +
    `<text:span text:style-name="Highlighted">Hervorgehoben</text:span>` +
    `</text:p>` +
    `<text:p>${FULL_COVERAGE_UMLAUT_TEXT}</text:p>`

  zip.file(
    'content.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.3">` +
      `<office:automatic-styles>${automaticStyles}</office:automatic-styles>` +
      `<office:body><office:text>${heading}${bulletList}${orderedList}${table}${image}${mixedFormatting}</office:text></office:body></office:document-content>`,
  )
  zip.file(
    'styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS} office:version="1.3"><office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles></office:document-styles>`,
  )
  zip.file(
    'meta.xml',
    `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${NS} xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>${FULL_COVERAGE_TITLE}</dc:title></office:meta></office:document-meta>`,
  )
  zip
    .folder('META-INF')!
    .file(
      'manifest.xml',
      `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">` +
        `<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>` +
        `<manifest:file-entry manifest:full-path="Pictures/image1.png" manifest:media-type="image/png"/>` +
        `</manifest:manifest>`,
    )

  return zip.generateAsync({ type: 'nodebuffer' })
}
