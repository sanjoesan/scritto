import JSZip from 'jszip'
import { readOdt } from '../reader'

// liste-einruecken-tab-req.md Befund C Zeile 3 (ODT-Zwilling des DOCX-Fixes): Ein
// text:list-style darf je text:level bullet- UND number-Definitionen mischen — vorher
// galt „irgendwo ein Number-Level → ganzer Stil ordered" für ALLE Ebenen. Zusätzlich
// erbt eine verschachtelte text:list ohne eigenes style-name den Stil der äußeren
// Liste; ihre Ebene entscheidet, welche list-level-style-Definition greift.

const NS =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'

async function buildMixedOdt(): Promise<Blob> {
  const contentXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-content ${NS} office:version="1.3">` +
    `<office:automatic-styles>` +
    `<text:list-style style:name="LX">` +
    `<text:list-level-style-bullet text:level="1" text:bullet-char="•"/>` +
    `<text:list-level-style-number text:level="2" style:num-format="1"/>` +
    `</text:list-style>` +
    `</office:automatic-styles>` +
    `<office:body><office:text>` +
    `<text:list text:style-name="LX">` +
    `<text:list-item><text:p>oben bullet</text:p>` +
    // verschachtelte Liste OHNE eigenes style-name — erbt LX, Ebene 2 = number
    `<text:list><text:list-item><text:p>unten nummeriert</text:p></text:list-item></text:list>` +
    `</text:list-item>` +
    `<text:list-item><text:p>wieder oben</text:p></text:list-item>` +
    `</text:list>` +
    `</office:text></office:body>` +
    `</office:document-content>`
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('content.xml', contentXml)
  return zip.generateAsync({ type: 'blob' })
}

describe('ODT-Import: gemischt-typige Ebenen innerhalb EINES Listenstils', () => {
  it('Ebene 1 bleibt Bullet, geerbte Ebene 2 wird Nummeriert (Typ je Ebene, nicht je Stil)', async () => {
    const result = await readOdt(await buildMixedOdt())
    const content = (result.body as { content: Array<{ type: string; content: Array<Record<string, unknown>> }> }).content
    expect(content).toHaveLength(1)
    const outer = content[0]
    expect(outer.type, 'Ebene 1 darf nicht durch das Number-Level auf ordered kippen').toBe('bullet_list')

    const firstItem = outer.content[0] as { content: Array<{ type: string }> }
    const nested = firstItem.content.find((n) => n.type === 'ordered_list')
    expect(nested, 'geerbte Ebene 2 muss als ordered_list erkannt werden').toBeTruthy()
    expect(JSON.stringify(nested)).toContain('unten nummeriert')
    expect(outer.content).toHaveLength(2) // "wieder oben" bleibt Ebene-1-Punkt
  })
})
