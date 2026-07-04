import type { ProseMirrorJSON } from './schema'

export interface WordDocumentContent {
  body: ProseMirrorJSON
  header: ProseMirrorJSON | null
  footer: ProseMirrorJSON | null
  meta: { title: string }
}

export function emptyDocJSON(): ProseMirrorJSON {
  return { type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'left' } }] }
}

export function createBlankWordDocument(): WordDocumentContent {
  return {
    body: emptyDocJSON(),
    header: null,
    footer: null,
    meta: { title: '' },
  }
}
