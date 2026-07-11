import JSZip from 'jszip'
import { writeDocx } from '../writer'
import { readDocx } from '../reader'
import type { WordDocumentContent } from '../../shared/documentModel'

// kopfzeile-bearbeiten-req.md §0.A/1: Bilder in Kopf-/Fußzeilen brauchen PART-EIGENE
// Relationships (word/_rels/header1.xml.rels) — vorher lagen sie in document.xml.rels,
// wo header1.xml sie nie auflöst (Logo unsichtbar), und der eigene Reader lud die
// Part-Rels nie (Import verlor das Bild).

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function docWithHeaderImage(): WordDocumentContent {
  return {
    body: { type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: 'Body' }] }] },
    header: {
      type: 'doc',
      content: [
        { type: 'image', attrs: { src: TINY_PNG, alt: 'Logo', width: 40, height: 40, naturalWidth: null, naturalHeight: null } },
        { type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: 'Briefkopf' }] },
      ],
    },
    footer: null,
    meta: { title: '' },
  }
}

describe('DOCX Kopfzeilen-Bild: Part-eigene Relationships (§0.A/1)', () => {
  it('Export: r:embed der Kopfzeile wird in header1.xml.rels aufgelöst, nicht in document.xml.rels', async () => {
    const blob = await writeDocx(docWithHeaderImage())
    const zip = await JSZip.loadAsync(blob)
    const headerXml = await zip.file('word/header1.xml')!.async('text')
    const embedId = /r:embed="([^"]+)"/.exec(headerXml)?.[1]
    expect(embedId).toBeTruthy()

    const headerRels = await zip.file('word/_rels/header1.xml.rels')!.async('text')
    expect(headerRels).toContain(`Id="${embedId}"`)
    expect(headerRels).toContain('media/')

    const documentRels = await zip.file('word/_rels/document.xml.rels')!.async('text')
    expect(documentRels).not.toContain('media/') // Bild-Rel gehört NICHT hierher
  })

  it('Rundreise: das Kopfzeilen-Bild kommt als aufgelöste data-URL zurück', async () => {
    const result = await readDocx(await writeDocx(docWithHeaderImage()))
    const header = result.header as { content: Array<{ type: string; attrs?: { src?: string } }> }
    const image = header.content.find((n) => n.type === 'image')
    expect(image?.attrs?.src?.startsWith('data:image/png;base64,')).toBe(true)
    expect(JSON.stringify(header.content)).toContain('Briefkopf')
  })
})
