import type { CSSProperties } from 'react'

/** A4 page geometry at 96 CSS px/inch (1mm = 96/25.4 px), used to simulate real pages on screen. */
const PX_PER_MM = 96 / 25.4

export const PAGE_WIDTH_PX = Math.round(210 * PX_PER_MM)
export const PAGE_HEIGHT_PX = Math.round(297 * PX_PER_MM)
export const PAGE_MARGIN_PX = Math.round(25 * PX_PER_MM)
/** Visual gap drawn between two pages (on top of the page margins) so sheets read as separate. */
export const PAGE_SEPARATOR_PX = 32

export const PAGE_CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - 2 * PAGE_MARGIN_PX
export const PAGE_CONTENT_WIDTH_PX = PAGE_WIDTH_PX - 2 * PAGE_MARGIN_PX
/** Height of the spacer inserted between pages: bottom margin + gap + next page's top margin. */
export const PAGE_GAP_PX = 2 * PAGE_MARGIN_PX + PAGE_SEPARATOR_PX

/**
 * A repeating background that paints alternating "page" (white, shadowed) and
 * "gap" (surrounding chrome color) bands behind the continuous editor content,
 * so a single scrolling surface reads as a stack of separate A4 sheets.
 */
export function pageBackgroundStyle(): CSSProperties {
  const period = PAGE_CONTENT_HEIGHT_PX + PAGE_GAP_PX
  return {
    backgroundImage: `linear-gradient(to bottom, white 0, white ${PAGE_CONTENT_HEIGHT_PX}px, transparent ${PAGE_CONTENT_HEIGHT_PX}px, transparent ${period}px)`,
    backgroundSize: `100% ${period}px`,
    backgroundRepeat: 'repeat-y',
    backgroundPositionY: `${PAGE_MARGIN_PX}px`,
  }
}
