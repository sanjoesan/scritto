import type { AnyFormatModule, PlannedFormat } from './types'

/** Implemented formats, registered here as each phase lands. */
export const formatModules: AnyFormatModule[] = []

/** Full format roadmap, used by the picker to show what's coming next. */
export const plannedFormats: PlannedFormat[] = [
  {
    id: 'odt',
    label: 'OpenDocument Text (.odt)',
    description: 'Seitenbasierter Texteditor mit Tabellen, Bildern, Kopf-/Fußzeile, Inhaltsverzeichnis.',
    extensions: ['.odt'],
  },
  {
    id: 'docx',
    label: 'Word-Dokument (.docx)',
    description: 'Seitenbasierter Texteditor, kompatibel mit Microsoft Word.',
    extensions: ['.docx'],
  },
  {
    id: 'xlsx',
    label: 'Tabellenkalkulation (.xlsx / .csv)',
    description: 'Zellen bearbeiten, Formeln, mehrere Tabellenblätter.',
    extensions: ['.xlsx', '.csv'],
  },
  {
    id: 'pdf',
    label: 'PDF-Dokument (.pdf)',
    description: 'Ansicht mit Zoom, Seitennavigation, Volltextsuche.',
    extensions: ['.pdf'],
  },
  {
    id: 'txt',
    label: 'Text (.txt)',
    description: 'Einfacher Texteditor.',
    extensions: ['.txt'],
  },
  {
    id: 'markdown',
    label: 'Markdown (.md)',
    description: 'Editor mit Live-Vorschau.',
    extensions: ['.md'],
  },
  {
    id: 'json',
    label: 'JSON (.json)',
    description: 'Code-Editor mit Validierung und Pretty-Print.',
    extensions: ['.json'],
  },
  {
    id: 'xml',
    label: 'XML (.xml)',
    description: 'Code-Editor mit Wohlgeformtheitsprüfung.',
    extensions: ['.xml'],
  },
]

export function findModuleById(id: string): AnyFormatModule | undefined {
  return formatModules.find((m) => m.id === id)
}

export function findModuleByExtension(fileName: string): AnyFormatModule | undefined {
  const lower = fileName.toLowerCase()
  return formatModules.find((m) => m.extensions.some((ext) => lower.endsWith(ext)))
}
