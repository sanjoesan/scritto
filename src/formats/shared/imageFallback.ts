/**
 * Shared, dependency-free helpers for handling images whose `src` cannot be
 * embedded into a DOCX/ODT file (anything that is not a `data:…;base64,…` URL —
 * e.g. an external `https://…` image pasted or dropped from the web).
 *
 * This module deliberately imports NOTHING (no prosemirror, no React, no jszip):
 * it is used by both the paste pipeline (`editor/paste.ts`) AND both format
 * writers (`docx/writer.ts`, `odt/writer.ts`), and the writers must stay free of
 * editor/prosemirror dependencies. It is the single source of truth for "is this
 * image embeddable?" so the rule cannot drift between the four call sites.
 * See specs/einfuegen-code.md Abschnitt 2.5 / 5.1.
 */

/**
 * Visible placeholder text used when an image cannot be embedded. Surrounding
 * text is always preserved; only the image itself becomes this text.
 */
export function imageFallbackText(alt: string | null | undefined): string {
  const trimmed = (alt ?? '').trim()
  return trimmed ? `[Bild: ${trimmed}]` : '[Bild nicht eingebettet]'
}

/**
 * True for exactly the `src` values that `ImageCollector.add()` (both formats)
 * accepts — a base64 data URL. Kept intentionally a touch looser than the
 * collectors' full `^data:([^;]+);base64,(.*)$` pattern, but asserting the same
 * necessary precondition `^data:…;base64,`, so a value that passes here always
 * passes the collector too.
 */
export function isEmbeddableImageSrc(src: string): boolean {
  return /^data:[^;]+;base64,/i.test(src)
}
