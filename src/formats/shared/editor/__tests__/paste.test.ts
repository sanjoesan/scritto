import { Fragment, Slice, type Node as PMNode, type Mark } from 'prosemirror-model'
import { wordSchema } from '../../schema'
import { imageFallbackText, isEmbeddableImageSrc } from '../../imageFallback'
import {
  splitPlainTextIntoParagraphs,
  plainTextClipboardParser,
  sanitizePastedHtml,
  sanitizePastedSlice,
  stripToPlainText,
} from '../paste'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function image(src: string, alt = '') {
  return wordSchema.nodes.image.create({ src, alt })
}
function slice(...nodes: PMNode[]) {
  return new Slice(Fragment.fromArray(nodes), 0, 0)
}
/** Flatten every text run of a slice/fragment for easy assertions. */
function allText(fragment: Fragment): string {
  const parts: string[] = []
  fragment.descendants((node) => {
    if (node.isText) parts.push(node.text ?? '')
  })
  return parts.join('')
}

describe('imageFallback helpers', () => {
  it('isEmbeddableImageSrc: only base64 data URLs are embeddable', () => {
    expect(isEmbeddableImageSrc(DATA_URL)).toBe(true)
    expect(isEmbeddableImageSrc('https://example.test/a.png')).toBe(false)
    expect(isEmbeddableImageSrc('blob:https://x/y')).toBe(false)
    expect(isEmbeddableImageSrc('')).toBe(false)
    expect(isEmbeddableImageSrc('data:image/svg+xml,<svg/>')).toBe(false) // not base64
  })

  it('imageFallbackText: with and without alt', () => {
    expect(imageFallbackText('Logo')).toBe('[Bild: Logo]')
    expect(imageFallbackText('  Logo  ')).toBe('[Bild: Logo]')
    expect(imageFallbackText('')).toBe('[Bild nicht eingebettet]')
    expect(imageFallbackText(null)).toBe('[Bild nicht eingebettet]')
    expect(imageFallbackText(undefined)).toBe('[Bild nicht eingebettet]')
  })
})

describe('splitPlainTextIntoParagraphs', () => {
  it('single line → one block, one line', () => {
    expect(splitPlainTextIntoParagraphs('hallo')).toEqual([['hallo']])
  })
  it('single block with several lines', () => {
    expect(splitPlainTextIntoParagraphs('a\nb\nc')).toEqual([['a', 'b', 'c']])
  })
  it('blank-line separated blocks', () => {
    expect(splitPlainTextIntoParagraphs('a\nb\n\nc')).toEqual([['a', 'b'], ['c']])
  })
  it('normalises \\r\\n and \\r before splitting', () => {
    expect(splitPlainTextIntoParagraphs('a\r\nb\r\n\r\nc')).toEqual([['a', 'b'], ['c']])
    expect(splitPlainTextIntoParagraphs('a\rb')).toEqual([['a', 'b']])
  })
  it('leaves tab characters untouched (Grenzfall 6)', () => {
    expect(splitPlainTextIntoParagraphs('a\tb')).toEqual([['a\tb']])
  })
  it('keeps astral characters intact (Grenzfall 5 — no split of surrogate pairs)', () => {
    expect(splitPlainTextIntoParagraphs('👨‍👩‍👧 test')).toEqual([['👨‍👩‍👧 test']])
  })
})

describe('plainTextClipboardParser', () => {
  function contextInParagraph(marks: readonly Mark[] = []) {
    const p = wordSchema.nodes.paragraph.create(null, wordSchema.text('x', marks))
    const doc = wordSchema.nodes.doc.create(null, p)
    return doc.resolve(2) // inside the paragraph text
  }

  it('single block → open inline slice (merges into surrounding paragraph)', () => {
    const s = plainTextClipboardParser('hallo', contextInParagraph(), wordSchema)
    // one paragraph, open on both ends so it merges inline
    expect(s.content.childCount).toBe(1)
    expect(s.content.child(0).type.name).toBe('paragraph')
    expect(s.openStart).toBe(1)
    expect(s.openEnd).toBe(1)
    expect(allText(s.content)).toBe('hallo')
  })

  it('single newline within a block → hard_break, not a new paragraph', () => {
    const s = plainTextClipboardParser('a\nb', contextInParagraph(), wordSchema)
    expect(s.content.childCount).toBe(1)
    const para = s.content.child(0)
    const kinds: string[] = []
    para.forEach((n) => kinds.push(n.type.name))
    expect(kinds).toEqual(['text', 'hard_break', 'text'])
  })

  it('blank line → separate paragraphs', () => {
    const s = plainTextClipboardParser('a\n\nb', contextInParagraph(), wordSchema)
    expect(s.content.childCount).toBe(2)
    expect(s.content.child(0).type.name).toBe('paragraph')
    expect(s.content.child(1).type.name).toBe('paragraph')
  })

  it('inherits the marks active at the cursor (Grenzfall 21 — no regression vs PM default)', () => {
    const strong = wordSchema.marks.strong.create()
    const s = plainTextClipboardParser('geerbt', contextInParagraph([strong]), wordSchema)
    const textNode = s.content.child(0).child(0)
    expect(textNode.isText).toBe(true)
    expect(strong.isInSet(textNode.marks)).toBe(true)
  })
})

describe('sanitizePastedHtml', () => {
  it('removes <script>/<style>/<iframe> but keeps the visible text', () => {
    const out = sanitizePastedHtml('<p>Vor<script>alert(1)</script><style>*{}</style><iframe src="x"></iframe>Nach</p>')
    expect(out).not.toMatch(/<script|<style|<iframe/i)
    expect(out).toContain('Vor')
    expect(out).toContain('Nach')
  })

  it('strips on* handlers and javascript: URLs (Grenzfall 15/20)', () => {
    const out = sanitizePastedHtml('<p><img src="x" onerror="alert(1)"><a href="javascript:alert(2)">Link</a></p>')
    expect(out.toLowerCase()).not.toContain('onerror')
    expect(out.toLowerCase()).not.toContain('javascript:')
    expect(out).toContain('Link') // link text survives
  })

  it('removes Office conditional comments / mso-* comment noise', () => {
    const out = sanitizePastedHtml('<p>A<!--[if gte mso 9]><xml>mso-list</xml><![endif]-->B</p>')
    expect(out).not.toContain('mso-list')
    expect(out).toContain('A')
    expect(out).toContain('B')
  })

  it('replaces a non-embeddable <img> by placeholder text, keeps surrounding text', () => {
    const out = sanitizePastedHtml('<p>vor <img src="https://example.test/x.png" alt="Foto"> nach</p>')
    expect(out).not.toContain('<img')
    expect(out).toContain('[Bild: Foto]')
    expect(out).toContain('vor')
    expect(out).toContain('nach')
  })

  it('leaves a data: image and ordinary formatting untouched', () => {
    const out = sanitizePastedHtml(`<p><strong>fett</strong></p><ul><li>x</li></ul><img src="${DATA_URL}">`)
    expect(out).toContain('<strong>')
    expect(out).toContain('<ul>')
    expect(out).toContain(DATA_URL)
  })
})

describe('sanitizePastedSlice', () => {
  it('replaces a non-embeddable image node with a placeholder paragraph', () => {
    const s = sanitizePastedSlice(slice(image('https://example.test/x.png', 'Bild1')), wordSchema)
    expect(s.content.child(0).type.name).toBe('paragraph')
    expect(allText(s.content)).toBe('[Bild: Bild1]')
  })
  it('keeps an embeddable data: image node', () => {
    const s = sanitizePastedSlice(slice(image(DATA_URL)), wordSchema)
    expect(s.content.child(0).type.name).toBe('image')
  })
})

describe('stripToPlainText', () => {
  it('removes all marks and turns headings into paragraphs', () => {
    const strong = wordSchema.marks.strong.create()
    const heading = wordSchema.nodes.heading.create({ level: 1 }, wordSchema.text('Titel', [strong]))
    const para = wordSchema.nodes.paragraph.create(null, wordSchema.text('rest', [strong]))
    const s = stripToPlainText(slice(heading, para), wordSchema)
    expect(s.content.child(0).type.name).toBe('paragraph') // heading → paragraph
    expect(s.content.child(1).type.name).toBe('paragraph')
    s.content.descendants((node) => {
      if (node.isText) expect(node.marks.length).toBe(0)
    })
    expect(allText(s.content)).toBe('Titelrest')
  })
})
