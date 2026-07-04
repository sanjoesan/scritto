/**
 * Minimal raw ZIP local-file-header scanner used by roundtrip tests that need to verify
 * the *actual on-disk compression method* of generated .docx/.odt packages (Bug 1.6,
 * speichern-exportieren-code.md). Deliberately does NOT use JSZip to read this back —
 * JSZip is also used by the writer under test, so reading the compression method through
 * it would not be an independent check of what actually landed in the zip bytes.
 *
 * ZIP local file header layout (relevant fields):
 *   offset 0..3   signature (0x04034b50)
 *   offset 8..9   compression method (0 = Stored, 8 = Deflate), little-endian
 *   offset 18..21 compressed size, little-endian
 *   offset 22..25 uncompressed size, little-endian
 *   offset 26..27 file name length, little-endian
 *   offset 28..29 extra field length, little-endian
 *   offset 30..    file name bytes
 *
 * Central directory entries start with signature 0x02014b50 — scanning stops there.
 */
export interface ZipEntryInfo {
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
}

export function readZipEntryInfo(buffer: Buffer): Map<string, ZipEntryInfo> {
  const LOCAL_FILE_HEADER_SIG = 0x04034b50
  const CENTRAL_DIR_SIG = 0x02014b50
  const result = new Map<string, ZipEntryInfo>()
  let offset = 0

  while (offset <= buffer.length - 4) {
    const sig = buffer.readUInt32LE(offset)
    if (sig === CENTRAL_DIR_SIG) break
    if (sig !== LOCAL_FILE_HEADER_SIG) {
      offset += 1
      continue
    }
    const compressionMethod = buffer.readUInt16LE(offset + 8)
    const compressedSize = buffer.readUInt32LE(offset + 18)
    const uncompressedSize = buffer.readUInt32LE(offset + 22)
    const nameLen = buffer.readUInt16LE(offset + 26)
    const extraLen = buffer.readUInt16LE(offset + 28)
    const name = buffer.toString('utf-8', offset + 30, offset + 30 + nameLen)
    result.set(name, { compressionMethod, compressedSize, uncompressedSize })
    const next = offset + 30 + nameLen + extraLen + compressedSize
    // Guard against a corrupt/unexpected jump landing us before the current header —
    // fall back to a byte-by-byte scan in that case instead of looping forever.
    offset = next > offset ? next : offset + 1
  }

  return result
}

/** Back-compat convenience wrapper returning just the compression method per entry. */
export function readZipEntryCompressionMethods(buffer: Buffer): Map<string, number> {
  const result = new Map<string, number>()
  for (const [name, info] of readZipEntryInfo(buffer)) {
    result.set(name, info.compressionMethod)
  }
  return result
}

export const ZIP_COMPRESSION_STORED = 0
export const ZIP_COMPRESSION_DEFLATE = 8

/**
 * Runs `fn` with the global `Date` constructor temporarily replaced so that `new Date()`
 * (no arguments) resolves to `iso`, then restores the real `Date`. Used to deterministically
 * probe whether a writer's output depends on wall-clock time — e.g. JSZip's `zip.file(name,
 * data)` defaults each entry's embedded ZIP-internal timestamp to `new Date()` at call time
 * when no explicit `date` option is passed (see `node_modules/jszip/lib/object.js`, `o.date =
 * o.date || new Date()`), which the writers under test (`writeDocx`/`writeOdt`) never override.
 * A real `setTimeout`-based sleep would prove the same thing but cost real wall-clock seconds
 * per test; mocking the constructor is instant and exact instead.
 */
export async function withMockedDate<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  const RealDate = Date
  // Only the zero-argument form (`new Date()`) needs to be mocked here — that's the
  // only form JSZip's `o.date = o.date || new Date()` (object.js) ever calls.
  class MockDate extends RealDate {
    constructor() {
      super(iso)
    }
    static override now(): number {
      return new RealDate(iso).getTime()
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).Date = MockDate
  try {
    return await fn()
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).Date = RealDate
  }
}
