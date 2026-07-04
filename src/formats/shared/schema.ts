import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model'
import { tableNodes } from 'prosemirror-tables'

const alignAttr = { align: { default: 'left', validate: 'string' } }

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: alignAttr,
    parseDOM: [{ tag: 'p', getAttrs: (dom) => ({ align: (dom as HTMLElement).style.textAlign || 'left' }) }],
    toDOM(node) {
      return ['p', { style: `text-align: ${node.attrs.align}` }, 0]
    },
  },

  heading: {
    group: 'block',
    content: 'inline*',
    attrs: { level: { default: 1, validate: 'number' }, ...alignAttr },
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      getAttrs: (dom) => ({ level, align: (dom as HTMLElement).style.textAlign || 'left' }),
    })),
    toDOM(node) {
      return [`h${node.attrs.level}`, { style: `text-align: ${node.attrs.align}` }, 0]
    },
  },

  text: { group: 'inline' },

  hard_break: {
    group: 'inline',
    inline: true,
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() {
      return ['br']
    },
  },

  image: {
    group: 'block',
    attrs: {
      src: { validate: 'string' },
      alt: { default: '', validate: 'string' },
      width: { default: null },
      height: { default: null },
    },
    draggable: true,
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom) => {
          const el = dom as HTMLImageElement
          return {
            src: el.getAttribute('src'),
            alt: el.getAttribute('alt') || '',
            width: el.getAttribute('width'),
            height: el.getAttribute('height'),
          }
        },
      },
    ],
    toDOM(node) {
      const { src, alt, width, height } = node.attrs
      return ['img', { src, alt, width, height }]
    },
  },

  bullet_list: {
    group: 'block',
    content: 'list_item+',
    parseDOM: [{ tag: 'ul' }],
    toDOM() {
      return ['ul', 0]
    },
  },

  ordered_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { start: { default: 1, validate: 'number' } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({ start: Number((dom as HTMLElement).getAttribute('start')) || 1 }),
      },
    ],
    toDOM(node) {
      return node.attrs.start === 1 ? ['ol', 0] : ['ol', { start: node.attrs.start }, 0]
    },
  },

  list_item: {
    content: 'paragraph block*',
    parseDOM: [{ tag: 'li' }],
    toDOM() {
      return ['li', 0]
    },
  },

  ...tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} }),
}

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight', getAttrs: (v) => /^(bold|[5-9]\d{2,})$/.test(v as string) && null }],
    toDOM() {
      return ['strong', 0]
    },
  },
  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM() {
      return ['em', 0]
    },
  },
  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() {
      return ['u', 0]
    },
  },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'strike' }, { style: 'text-decoration=line-through' }],
    toDOM() {
      return ['s', 0]
    },
  },
  textColor: {
    attrs: { color: { validate: 'string' } },
    parseDOM: [{ style: 'color', getAttrs: (value) => ({ color: value }) }],
    toDOM(mark) {
      return ['span', { style: `color: ${mark.attrs.color}` }, 0]
    },
  },
  highlight: {
    attrs: { color: { validate: 'string' } },
    parseDOM: [{ style: 'background-color', getAttrs: (value) => ({ color: value }) }],
    toDOM(mark) {
      return ['span', { style: `background-color: ${mark.attrs.color}` }, 0]
    },
  },
}

export const wordSchema = new Schema({ nodes, marks })

/** The plain-JSON shape produced by `node.toJSON()` / consumed by `Node.fromJSON(schema, json)`. */
export type ProseMirrorJSON = Record<string, unknown>
