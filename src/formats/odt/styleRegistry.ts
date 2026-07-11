import { escapeXml } from './xmlUtil'

export interface RunProps {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  highlight?: string
  /** Schriftgröße in pt — exakt, auch nicht-0,5er-Importwerte wie 10.3
   * (schriftgroesse-waehlen-req.md §2.5). */
  fontSizePt?: number
  /** Schriftartname — exakt wie gewählt/gelesen (schriftart-waehlen-req.md §2.7). */
  fontFamily?: string
}

function isEmpty(props: RunProps): boolean {
  return (
    !props.bold &&
    !props.italic &&
    !props.underline &&
    !props.strike &&
    !props.color &&
    !props.highlight &&
    props.fontSizePt === undefined &&
    props.fontFamily === undefined
  )
}

/**
 * Deduplicates mark combinations into ODF `style:style` (family "text")
 * definitions, generating stable names (T1, T2, ...) as new combinations
 * are seen. Each ODT part (content.xml vs styles.xml) needs its own
 * instance, since automatic styles aren't shared across parts.
 */
export class TextStyleRegistry {
  private byKey = new Map<string, string>()
  private defs: string[] = []
  private counter = 0
  private fontFamilies = new Set<string>()

  /** Returns the style name to reference for this mark combination, or null if plain text suffices. */
  styleNameFor(props: RunProps): string | null {
    if (isEmpty(props)) return null
    if (props.fontFamily) this.fontFamilies.add(props.fontFamily)
    const key = JSON.stringify(props)
    const existing = this.byKey.get(key)
    if (existing) return existing

    this.counter += 1
    const name = `T${this.counter}`
    this.byKey.set(key, name)
    this.defs.push(buildTextStyleXml(name, props))
    return name
  }

  serializeDefs(): string {
    return this.defs.join('')
  }

  /**
   * ODF verlangt für jede referenzierte Schriftart die DOPPELverankerung: neben dem
   * `style:font-name`-Attribut am Textstil auch ein `style:font-face`-Eintrag in
   * `office:font-face-decls` (schriftart-waehlen-req.md §2.9) — dedupliziert pro
   * Dokumentteil (jede Registry-Instanz = ein Teil, analog bodyStyles/chromeStyles).
   * Mehrteilige Namen erhalten in svg:font-family LibreOffice-üblich Apostrophe.
   */
  serializeFontFaceDecls(): string {
    if (this.fontFamilies.size === 0) return ''
    const decls = [...this.fontFamilies]
      .map((family) => {
        const svgValue = /[\s,]/.test(family) ? `'${family}'` : family
        return `<style:font-face style:name="${escapeXml(family)}" svg:font-family="${escapeXml(svgValue)}"/>`
      })
      .join('')
    return `<office:font-face-decls>${decls}</office:font-face-decls>`
  }
}

function buildTextStyleXml(name: string, props: RunProps): string {
  const attrs: string[] = []
  if (props.bold) attrs.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"')
  if (props.italic) attrs.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"')
  if (props.underline) {
    attrs.push(
      'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"',
    )
  }
  if (props.strike) attrs.push('style:text-line-through-style="solid" style:text-line-through-type="single"')
  if (props.fontFamily !== undefined) attrs.push(`style:font-name="${escapeXml(props.fontFamily)}"`)
  if (props.fontSizePt !== undefined) {
    attrs.push(
      `fo:font-size="${props.fontSizePt}pt" style:font-size-asian="${props.fontSizePt}pt" style:font-size-complex="${props.fontSizePt}pt"`,
    )
  }
  if (props.color) attrs.push(`fo:color="${escapeXml(props.color)}"`)
  if (props.highlight) attrs.push(`fo:background-color="${escapeXml(props.highlight)}"`)
  return `<style:style style:name="${name}" style:family="text"><style:text-properties ${attrs.join(' ')}/></style:style>`
}

export const PARAGRAPH_ALIGN_STYLE_NAME: Record<string, string> = {
  left: 'Ppara-left',
  center: 'Ppara-center',
  right: 'Ppara-right',
  justify: 'Ppara-justify',
}

// Break-before variants: ODF encodes a manual page break as `fo:break-before="page"` on
// the style of the paragraph that starts the new page — the exact mechanism LibreOffice
// Writer's own Ctrl+Enter uses (seitenumbruch-req.md §3.6). One variant per alignment so
// a break never costs the paragraph its alignment.
export const PARAGRAPH_ALIGN_BREAK_STYLE_NAME: Record<string, string> = {
  left: 'Ppara-left-pb',
  center: 'Ppara-center-pb',
  right: 'Ppara-right-pb',
  justify: 'Ppara-justify-pb',
}

export function paragraphAlignStyleDefs(): string {
  const plain = Object.entries(PARAGRAPH_ALIGN_STYLE_NAME).map(
    ([align, name]) =>
      `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="${align}"/></style:style>`,
  )
  const withBreak = Object.entries(PARAGRAPH_ALIGN_BREAK_STYLE_NAME).map(
    ([align, name]) =>
      `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="${align}" fo:break-before="page"/></style:style>`,
  )
  return [...plain, ...withBreak].join('')
}

const HEADING_FONT_SIZES: Record<number, number> = { 1: 24, 2: 20, 3: 18, 4: 16, 5: 14, 6: 13 }
const ALIGNS = ['left', 'center', 'right', 'justify'] as const

export function headingStyleName(level: number, align: string, breakBefore = false): string {
  return `Heading${level}-${align}${breakBefore ? '-pb' : ''}`
}

export function headingStyleDefs(): string {
  return Object.entries(HEADING_FONT_SIZES)
    .flatMap(([level, size]) =>
      ALIGNS.flatMap((align) =>
        [false, true].map(
          (breakBefore) =>
            `<style:style style:name="${headingStyleName(Number(level), align, breakBefore)}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="${align}"${breakBefore ? ' fo:break-before="page"' : ''}/><style:text-properties fo:font-weight="bold" fo:font-size="${size}pt"/></style:style>`,
        ),
      ),
    )
    .join('')
}

export const BULLET_LIST_STYLE_NAME = 'LB'
export const ORDERED_LIST_STYLE_NAME = 'LO'

// All 10 ODF list levels get a real definition (previously only text:level="1"): a
// nested level exported to ODT otherwise had no bullet glyph/number format/indent of
// its own in LibreOffice (liste-einruecken-tab-req.md Befund C — the ODT twin of the
// DOCX numbering-levels fix). Glyphs/number formats cycle like their DOCX counterparts
// in docx/styleDefs.ts; the label indent grows 0.5cm per level.
const ODT_BULLET_GLYPHS = ['•', '◦', '▪']
const ODT_NUMBER_FORMATS = ['1', 'a', 'i']
const ODF_MAX_LIST_LEVEL = 10

function listLevelProps(level: number): string {
  return `<style:list-level-properties text:space-before="${(0.5 * level).toFixed(1)}cm" text:min-label-width="0.5cm"/>`
}

export function listStyleDefs(): string {
  const bulletLevels = Array.from({ length: ODF_MAX_LIST_LEVEL }, (_, i) => {
    const level = i + 1
    return `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${ODT_BULLET_GLYPHS[i % ODT_BULLET_GLYPHS.length]}">${listLevelProps(level)}</text:list-level-style-bullet>`
  }).join('')
  const numberLevels = Array.from({ length: ODF_MAX_LIST_LEVEL }, (_, i) => {
    const level = i + 1
    return `<text:list-level-style-number text:level="${level}" style:num-format="${ODT_NUMBER_FORMATS[i % ODT_NUMBER_FORMATS.length]}" style:num-suffix=".">${listLevelProps(level)}</text:list-level-style-number>`
  }).join('')
  return (
    `<text:list-style style:name="${BULLET_LIST_STYLE_NAME}">${bulletLevels}</text:list-style>` +
    `<text:list-style style:name="${ORDERED_LIST_STYLE_NAME}">${numberLevels}</text:list-style>`
  )
}
