export interface CollectedImage {
  fileName: string
  mimeType: string
  base64: string
}

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.*)$/s

/** Collects images referenced from body/header/footer content, deduping by source data URL. */
export class ImageCollector {
  private images: CollectedImage[] = []
  private fileNameByDataUrl = new Map<string, string>()

  add(dataUrl: string): string {
    const existing = this.fileNameByDataUrl.get(dataUrl)
    if (existing) return existing

    const match = DATA_URL_PATTERN.exec(dataUrl)
    if (!match) throw new Error('Bilder müssen als data-URL vorliegen, um eingebettet zu werden.')
    const [, mimeType, base64] = match
    const ext = mimeType.split('/')[1]?.replace('+xml', '') || 'png'
    const fileName = `Pictures/image${this.images.length + 1}.${ext}`

    this.images.push({ fileName, mimeType, base64 })
    this.fileNameByDataUrl.set(dataUrl, fileName)
    return fileName
  }

  all(): CollectedImage[] {
    return this.images
  }
}
