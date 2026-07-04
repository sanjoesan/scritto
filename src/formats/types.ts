import type { ComponentType } from 'react'

/** A document held entirely in memory for the lifetime of the tab — never persisted. */
export interface OpenDocument<TContent = unknown> {
  fileName: string
  content: TContent
  dirty: boolean
}

export interface FormatEditorProps<TContent = unknown> {
  document: OpenDocument<TContent>
  onChange: (content: TContent) => void
}

export interface FormatModule<TContent = unknown> {
  id: string
  label: string
  description: string
  extensions: string[]
  mimeTypes: string[]
  /** Parses an uploaded File into this format's in-memory content model. */
  importFile: (file: File) => Promise<TContent>
  /** Serializes the in-memory content model back to a downloadable Blob. */
  exportFile: (content: TContent, fileName: string) => Promise<Blob>
  /** Produces a blank starting document for "create new". */
  createNew: () => TContent
  /** Default file name (without extension) used for new documents. */
  defaultName: string
  editor: ComponentType<FormatEditorProps<TContent>>
}

/**
 * A module boxed for storage in a heterogeneous registry/props where the
 * concrete content type isn't known to the caller (e.g. the format picker).
 * Individual format modules should still be authored as `FormatModule<MyContent>`.
 */
export type AnyFormatModule = FormatModule<any>

/** Formats that are planned but not implemented yet — shown disabled in the picker. */
export interface PlannedFormat {
  id: string
  label: string
  description: string
  extensions: string[]
}
