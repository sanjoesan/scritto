import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import { PAGE_CONTENT_HEIGHT_PX, PAGE_GAP_PX } from './pageLayout'

/**
 * Given the rendered height of each top-level block (in document order),
 * returns the child indices at which a new page should start. A block taller
 * than a whole page is simply left to overflow that page rather than split —
 * true intra-block splitting would require duplicating DOM nodes across pages,
 * which ProseMirror's single-EditorView model doesn't support.
 */
export function computePageBreakIndices(heights: number[], pageContentHeight: number): number[] {
  if (pageContentHeight <= 0) return []
  const breaks: number[] = []
  let cumulative = 0
  for (let i = 0; i < heights.length; i++) {
    const height = heights[i]
    if (cumulative > 0 && cumulative + height > pageContentHeight) {
      breaks.push(i)
      cumulative = 0
    }
    cumulative += height
  }
  return breaks
}

export function computePageCount(heights: number[], pageContentHeight: number): number {
  return computePageBreakIndices(heights, pageContentHeight).length + 1
}

const paginationKey = new PluginKey<DecorationSet>('pagination')

function measureAndBuildDecorations(view: EditorView): DecorationSet {
  const dom = view.dom
  const children = Array.from(dom.children) as HTMLElement[]
  // `offsetHeight` is the element's *layout* height in CSS px and is NOT affected
  // by a CSS `transform: scale()` on an ancestor (unlike getBoundingClientRect,
  // whose returned rect IS scaled). Using it keeps pagination correct under any
  // zoom factor: we always compare the true, unscaled block heights against the
  // unscaled page-content height. See specs/dokument-darstellung-req.md §3 (edge 4).
  const heights = children.map((el) => el.offsetHeight)
  const breakIndices = computePageBreakIndices(heights, PAGE_CONTENT_HEIGHT_PX)

  if (breakIndices.length === 0) return DecorationSet.empty

  const breakIndexSet = new Set(breakIndices)
  const decorations: Decoration[] = []
  view.state.doc.forEach((_node, offset, index) => {
    if (breakIndexSet.has(index)) {
      decorations.push(
        Decoration.widget(
          offset,
          () => {
            const spacer = document.createElement('div')
            spacer.className = 'page-break-spacer'
            spacer.style.height = `${PAGE_GAP_PX}px`
            spacer.setAttribute('aria-hidden', 'true')
            spacer.setAttribute('contenteditable', 'false')
            return spacer
          },
          { side: -1, key: `page-break-${index}` },
        ),
      )
    }
  })

  return DecorationSet.create(view.state.doc, decorations)
}

/**
 * Repaginates the document by inserting spacer widgets at computed page
 * breaks. Measurement must happen after the DOM has been (re-)painted, so
 * this recomputes inside the plugin view's `update` hook and dispatches a
 * follow-up transaction only when the break positions actually changed —
 * otherwise it would dispatch-on-every-update forever.
 */
export function createPaginationPlugin(): Plugin {
  return new Plugin({
    key: paginationKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, old) {
        const next = tr.getMeta(paginationKey) as DecorationSet | undefined
        if (next) return next
        return old.map(tr.mapping, tr.doc)
      },
    },
    props: {
      decorations(state) {
        return paginationKey.getState(state)
      },
    },
    view(view) {
      const recompute = () => {
        const next = measureAndBuildDecorations(view)
        const current = paginationKey.getState(view.state)
        if (current && sameDecorationSet(current, next)) return
        view.dispatch(view.state.tr.setMeta(paginationKey, next))
      }
      // Defer past the current paint so getBoundingClientRect reflects the new DOM.
      const raf = requestAnimationFrame(recompute)
      return {
        update: () => {
          requestAnimationFrame(recompute)
        },
        destroy: () => cancelAnimationFrame(raf),
      }
    },
  })
}

function sameDecorationSet(a: DecorationSet, b: DecorationSet): boolean {
  const aLocal = a.find()
  const bLocal = b.find()
  if (aLocal.length !== bLocal.length) return false
  for (let i = 0; i < aLocal.length; i++) {
    if (aLocal[i].from !== bLocal[i].from) return false
  }
  return true
}
