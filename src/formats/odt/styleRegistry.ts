import { escapeXml } from './xmlUtil'

export interface RunProps {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  highlight?: string
}

function isEmpty(props: RunProps): boolean {
  return !props.bold && !props.italic && !props.underline && !props.strike && !props.color && !props.highlight
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

  /** Returns the style name to reference for this mark combination, or null if plain text suffices. */
  styleNameFor(props: RunProps): string | null {
    if (isEmpty(props)) return null
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

export function paragraphAlignStyleDefs(): string {
  return Object.entries(PARAGRAPH_ALIGN_STYLE_NAME)
    .map(
      ([align, name]) =>
        `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="${align}"/></style:style>`,
    )
    .join('')
}

const HEADING_FONT_SIZES: Record<number, number> = { 1: 24, 2: 20, 3: 18, 4: 16, 5: 14, 6: 13 }
const ALIGNS = ['left', 'center', 'right', 'justify'] as const

export function headingStyleName(level: number, align: string): string {
  return `Heading${level}-${align}`
}

export function headingStyleDefs(): string {
  return Object.entries(HEADING_FONT_SIZES)
    .flatMap(([level, size]) =>
      ALIGNS.map(
        (align) =>
          `<style:style style:name="${headingStyleName(Number(level), align)}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="${align}"/><style:text-properties fo:font-weight="bold" fo:font-size="${size}pt"/></style:style>`,
      ),
    )
    .join('')
}

export const BULLET_LIST_STYLE_NAME = 'LB'
export const ORDERED_LIST_STYLE_NAME = 'LO'

export function listStyleDefs(): string {
  return (
    `<text:list-style style:name="${BULLET_LIST_STYLE_NAME}"><text:list-level-style-bullet text:level="1" text:bullet-char="•"><style:list-level-properties text:space-before="0.5cm" text:min-label-width="0.5cm"/></text:list-level-style-bullet></text:list-style>` +
    `<text:list-style style:name="${ORDERED_LIST_STYLE_NAME}"><text:list-level-style-number text:level="1" style:num-format="1" style:num-suffix="."><style:list-level-properties text:space-before="0.5cm" text:min-label-width="0.5cm"/></text:list-level-style-number></text:list-style>`
  )
}
