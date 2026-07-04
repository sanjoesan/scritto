import type { FormatModule } from '../types'
import { createBlankWordDocument, type WordDocumentContent } from '../shared/documentModel'
import { WordEditor } from '../shared/editor/WordEditor'
import { readOdt } from './reader'
import { writeOdt } from './writer'

export const odtModule: FormatModule<WordDocumentContent> = {
  id: 'odt',
  label: 'OpenDocument Text (.odt)',
  description: 'Seitenbasierter Texteditor mit Tabellen, Bildern, Kopf-/Fußzeile.',
  extensions: ['.odt'],
  mimeTypes: ['application/vnd.oasis.opendocument.text'],
  importFile: (file) => readOdt(file),
  exportFile: (content) => writeOdt(content),
  createNew: () => createBlankWordDocument(),
  defaultName: 'Unbenanntes Dokument',
  editor: WordEditor,
}
