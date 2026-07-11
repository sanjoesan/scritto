import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { EditorState, TextSelection, NodeSelection, Selection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { history, undo, redo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { splitListItem } from 'prosemirror-schema-list'
import { tableEditing, columnResizing } from 'prosemirror-tables'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor, GapCursor } from 'prosemirror-gapcursor'
import { wordSchema } from '../schema'
import {
  applyLink,
  cutSelection,
  indentListItem,
  insertHardBreak,
  insertPageBreak,
  insertTable,
  linkAtSelection,
  outdentListItem,
  removeLink,
  selectedImage,
} from './commands'
import { LinkDialog } from './LinkDialog'
import { SearchBar } from './SearchBar'
import { createSearchPlugin } from './search'
import { HeaderFooterEditor, emptyHeaderFooter } from './HeaderFooterEditor'
import { clipboardTextSerializer } from './clipboard'
import { createPastePlugin } from './paste'
import { createPaginationPlugin } from './pagination'
import {
  pageBackgroundStyle,
  PAGE_WIDTH_PX,
  PAGE_HEIGHT_PX,
  PAGE_MARGIN_PX,
  PAGE_CONTENT_HEIGHT_PX,
  PAGE_GAP_PX,
} from './pageLayout'
import { Toolbar } from './Toolbar'
import { TableSizeDialog } from './TableSizeDialog'
import { ImageResizeNodeView } from './imageNodeView'
import { ImageSizePanel } from './ImageSizePanel'
import type { FormatEditorProps } from '../../types'
import type { WordDocumentContent } from '../documentModel'

/**
 * ProseMirror can fail to collapse a stale non-empty selection (e.g. an
 * `AllSelection` left over from Ctrl+A, or a selection whose surrounding
 * text just got re-wrapped by a toolbar command like Bold) when the user
 * then clicks to place the caret elsewhere — the DOM caret moves, but
 * `view.state.selection` doesn't. Left uncorrected, the *next* keystroke
 * (Enter, typing, ...) acts on that stale range instead of the new caret
 * position — e.g. Enter silently no-ops because commands like `splitBlock`
 * don't know how to split an `AllSelection`, and plain typing instead wipes
 * out and replaces the entire stale selection.
 *
 * Clicking *inside* an existing, non-collapsed selection does not reliably
 * collapse the browser's native selection by the time `mouseup` fires —
 * Chrome deliberately keeps it live (to support drag-to-move of the
 * selected text) unless the pointer actually moves before release. So
 * `document.getSelection().isCollapsed` cannot be used to detect "this was
 * a plain click": it is measured, not assumed. Instead, mousedown/mouseup
 * coordinates are compared — no meaningful movement between them means a
 * plain click, and the model selection is force-collapsed to that point via
 * `posAtCoords` regardless of what the native selection currently reports.
 * A real drag (mouseup far from mousedown) is left untouched so this never
 * fights ProseMirror's own handling of an actual drag-to-select.
 */
function reconcileSelectionOnClick(view: EditorView, event: MouseEvent) {
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!coords) return
  const { selection } = view.state
  // A GapCursor is the ONLY caret before/after a boundary table (basis-stabilisierung-req.md
  // B2). When the click landed in that same gap zone, collapsing "near" a text position
  // would tear the caret into the adjacent cell — leave it be. A stale gap elsewhere in the
  // document is still repaired like any other selection.
  if (selection instanceof GapCursor && Math.abs(coords.pos - selection.head) <= 1) return
  const newSelection = TextSelection.near(view.state.doc.resolve(coords.pos))
  if (!newSelection.eq(selection)) {
    view.dispatch(view.state.tr.setSelection(newSelection))
  }
}

/**
 * Auto-dismisses a transient, visible notice after `ms` — used by the
 * "Ausschneiden" error banner (red, role="alert"). `setValue` is a stable React
 * state setter, so the effect only re-runs when the message itself changes.
 */
function useAutoDismiss(value: string | null, setValue: (value: null) => void, ms = 4000) {
  useEffect(() => {
    if (!value) return
    const id = window.setTimeout(() => setValue(null), ms)
    return () => window.clearTimeout(id)
  }, [value, setValue, ms])
}

/** Compact zoom controls shown as a status bar below the page area. */
function ZoomBar({
  zoom,
  isFit,
  onZoomOut,
  onZoomIn,
  onFit,
  onActualSize,
}: {
  zoom: number
  isFit: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
  onActualSize: () => void
}) {
  // Touch targets ≥ 40px (UX-Invarianten §4 / specs/UX-INVARIANTEN.md).
  const btn =
    'min-w-10 min-h-10 px-2 rounded text-sm flex items-center justify-center border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
  return (
    <div className="flex items-center justify-end gap-1 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-2 py-1">
      <button type="button" aria-label="Verkleinern" title="Verkleinern" onClick={onZoomOut} className={btn}>
        −
      </button>
      <span aria-label="Zoomstufe" className="min-w-12 text-center text-xs tabular-nums text-neutral-600 dark:text-neutral-400">
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" aria-label="Vergrößern" title="Vergrößern" onClick={onZoomIn} className={btn}>
        +
      </button>
      <button
        type="button"
        onClick={onFit}
        aria-pressed={isFit}
        title="An Breite anpassen"
        className={`${btn} ${isFit ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : ''}`}
      >
        An Breite anpassen
      </button>
      <button type="button" onClick={onActualSize} title="Originalgröße (100%)" className={btn}>
        100%
      </button>
    </div>
  )
}

export function WordEditor({ document: doc, onChange }: FormatEditorProps<WordDocumentContent>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [, forceRender] = useState(0)
  const [cutError, setCutError] = useState<string | null>(null)
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)
  // The table-size chooser (replaces the old fixed 2×2 insert). While it is open its full-screen
  // backdrop intercepts editor clicks, so the ProseMirror selection captured when the button was
  // pressed (onMouseDown preventDefault) stays put until "Einfügen" runs — no separate save/restore.
  const [tableDialogOpen, setTableDialogOpen] = useState(false)
  // Link-Dialog (hyperlink-einfuegen-req.md §1 #3): geöffnet über Toolbar-Button ODER
  // Strg/Cmd+K. Der Keymap-Handler lebt im einmalig erstellten Plugin-Array und erreicht
  // den React-State über diese Ref (gleiches Muster wie onChangeRef).
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const openLinkDialogRef = useRef(() => {})
  openLinkDialogRef.current = () => setLinkDialogOpen(true)

  // Suche (suchen-req.md §2): searchNonce > 0 = Leiste offen; jede Erhöhung fokussiert/
  // selektiert das Suchfeld erneut (Grenzfall „erneutes Strg+F bei offener Leiste").
  const [searchNonce, setSearchNonce] = useState(0)

  // Kopf-/Fußzeile (kopfzeile-/fusszeile-bearbeiten-req.md): eigene EditorViews; die
  // Toolbar bindet an die jeweils FOKUSSIERTE Instanz (§1 #6). docContentRef hält den
  // je aktuellen Dokumentstand für die onChange-Spreads aller drei Views.
  const docContentRef = useRef(doc.content)
  docContentRef.current = doc.content
  const [focusedHF, setFocusedHF] = useState<EditorView | null>(null)
  const patchDocument = (patch: Partial<WordDocumentContent>) => {
    onChangeRef.current({ ...docContentRef.current, ...patch })
  }
  const toggleHeaderFooter = (kind: 'header' | 'footer') => {
    const existing = docContentRef.current[kind] as { content?: Array<{ content?: unknown[] }> } | null
    const label = kind === 'header' ? 'Kopfzeile' : 'Fußzeile'
    if (!existing) {
      patchDocument({ [kind]: emptyHeaderFooter() } as Partial<WordDocumentContent>)
      return
    }
    // Ausblenden = Entfernen (das Modell kennt nur vorhanden/null); bei nicht-leerem
    // Inhalt schützt eine Bestätigung vor Datenverlust (req §1 #5, window.confirm wie
    // in DocumentWorkspace). Aktivieren/Entfernen laufen auf App-Ebene und sind BEWUSST
    // kein Editor-Undo-Schritt (req §10 Frage 3 — der Dialog ist der Schutzmechanismus).
    const isEmpty =
      !existing.content || (existing.content.length === 1 && !(existing.content[0].content?.length ?? 0))
    if (!isEmpty && !window.confirm(`${label} samt Inhalt entfernen?`)) return
    setFocusedHF(null)
    patchDocument({ [kind]: null } as Partial<WordDocumentContent>)
  }
  /** Die Instanz, auf die Toolbar und Dialoge wirken: fokussierte Kopf-/Fußzeile,
   * sonst der Haupttext (req §1 #6 „kontextsensitiv an die fokussierte Instanz"). */
  const targetView = focusedHF ?? viewRef.current
  // Strg/Cmd+F auf WORKSPACE-Ebene — muss auch greifen, wenn der Editor noch keinen
  // Fokus hatte (direkt nach Import); echte Formularfelder AUSSERHALB der Suche behalten
  // ihr natives Verhalten (§2 „Fokus-Klarstellung").
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || (event.key !== 'f' && event.key !== 'F')) return
      const target = event.target as HTMLElement
      const isFormField = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if (isFormField && !target.hasAttribute('data-search-input')) return
      event.preventDefault()
      setSearchNonce((n) => n + 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Visible-but-transient feedback (never a permanent/blocking state).
  useAutoDismiss(cutError, setCutError)
  useAutoDismiss(pasteNotice, setPasteNotice)

  // ---- Zoom + responsive A4 fit (specs/dokument-darstellung-req.md §2.2/2.3) ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const [availWidth, setAvailWidth] = useState(PAGE_WIDTH_PX)
  const [sheetHeight, setSheetHeight] = useState(PAGE_HEIGHT_PX)
  // null = auto-fit-to-width; a number = explicit user zoom (overrides auto until "Anpassen").
  const [userZoom, setUserZoom] = useState<number | null>(null)

  const ZOOM_MIN = 0.25
  const ZOOM_MAX = 3
  const GUTTER_PX = 24
  const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z * 100) / 100))
  // Auto-fit: a viewport narrower than one A4 sheet (phone / narrow tablet) scales the
  // sheet down to the available width so nothing overflows horizontally; a wide viewport
  // caps at 100% and just centres the page.
  const fitZoom = Math.max(ZOOM_MIN, Math.min(1, (availWidth - GUTTER_PX) / PAGE_WIDTH_PX))
  const zoom = userZoom ?? fitZoom
  // The image NodeView is created once (in the mount effect) but its drag handler needs the
  // *current* zoom to convert screen-px deltas to model px — read it through a ref.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // Live size mirrored from an in-progress image handle drag, so the size panel's number
  // fields track the drag (§1.6). null when no drag is active.
  const [liveImageSize, setLiveImageSize] = useState<{ w: number; h: number } | null>(null)

  // Track the scroll container's available width and the sheet's natural (unscaled)
  // height. `offsetHeight` and ResizeObserver are both transform-invariant, so the
  // scaled footprint below reserves exactly the right space (correct scrolling +
  // centring, no mobile overflow) regardless of the current zoom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setAvailWidth(el.clientWidth)
    update()
    if (typeof ResizeObserver === 'undefined') return // jsdom / very old browsers
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    const update = () => setSheetHeight(el.offsetHeight)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // B4 (basis-stabilisierung-req.md §2.4): the sheet is always as tall as WHOLE pages —
  // an empty document shows one full A4 sheet and a partially filled last page is padded
  // to full height. Derived from the CONTENT flow height (containerRef), which the sheet's
  // own min-height does not influence — measuring the sheet itself would feed back.
  const [pageMinHeight, setPageMinHeight] = useState(PAGE_HEIGHT_PX)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const FLOW_PERIOD = PAGE_CONTENT_HEIGHT_PX + PAGE_GAP_PX // one page of content + one spacer
    const update = () => {
      const flowPages = Math.max(1, Math.floor(el.offsetHeight / FLOW_PERIOD) + 1)
      // The pagination plugin's spacers know the TRUE page count — a manual page break
      // (seitenumbruch-req.md §3.8) forces a new page long before the flow height alone
      // would suggest one. Spacer insertion/removal always changes the flow height by
      // PAGE_GAP_PX, so this ResizeObserver re-runs on every pagination change.
      const spacerPages = el.querySelectorAll('.page-break-spacer').length + 1
      const pages = Math.max(flowPages, spacerPages)
      setPageMinHeight(pages * FLOW_PERIOD - PAGE_GAP_PX + 2 * PAGE_MARGIN_PX)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Ctrl/Cmd +/-/0 zoom, best-effort (the editor is the only surface mounted here).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        setUserZoom((z) => clampZoom((z ?? fitZoom) + 0.1))
      } else if (event.key === '-') {
        event.preventDefault()
        setUserZoom((z) => clampZoom((z ?? fitZoom) - 0.1))
      } else if (event.key === '0') {
        event.preventDefault()
        setUserZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitZoom])

  useEffect(() => {
    if (!containerRef.current) return

    const bodyNode = wordSchema.nodeFromJSON(doc.content.body)
    const state = EditorState.create({
      doc: bodyNode,
      schema: wordSchema,
      plugins: [
        history(),
        keymap({
          // Mod-c/Mod-v (copy/paste) are deliberately NOT bound here: they run
          // exclusively through ProseMirror's native clipboard default handler
          // (prosemirror-view, handlers.copy/paste) plus the
          // `clipboardTextSerializer` set below. Any future keymap addition
          // must be checked against accidentally swallowing these via an
          // overly broad binding. See specs/kopieren-req.md Abschnitt 3,
          // specs/kopieren-code.md Abschnitt 8.
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
          Enter: splitListItem(wordSchema.nodes.list_item),
          // Tab/Umschalt+Tab ändern im LISTENkontext die Ebene und werden dort immer
          // konsumiert (auch als sichtbarer No-Op beim ersten Punkt — kein Fokus-Sprung
          // aus dem Editor); außerhalb von Listen reichen beide durch
          // (liste-einruecken-tab-req.md §2/§3.1–3.6).
          Tab: indentListItem(),
          'Shift-Tab': outdentListItem(),
          // Strg/Cmd+K = Link einfügen/bearbeiten (hyperlink-einfuegen-req.md §1 #2) —
          // öffnet denselben Dialog wie der Toolbar-Button.
          'Mod-k': () => {
            openLinkDialogRef.current()
            return true
          },
          'Shift-Enter': insertHardBreak(),
          // Strg/Cmd+Enter = manueller Seitenumbruch — der in Word UND LibreOffice
          // identische Standard-Shortcut (seitenumbruch-req.md §1.2). Bewusst getrennt
          // von Shift-Enter (Zeilenumbruch) — zwei verschiedene Konzepte (§3.11).
          'Mod-Enter': insertPageBreak(setPasteNotice),
          'Mod-b': toggleMark(wordSchema.marks.strong),
          'Mod-i': toggleMark(wordSchema.marks.em),
          'Mod-u': toggleMark(wordSchema.marks.underline),
          // Ctrl/Cmd+X: a *text / cell / all* selection falls through (return false) to
          // prosemirror-view's native `cut` handler, exactly as before. But a NODE selection —
          // in practice a selected image, whose NodeView wraps the <img> in a
          // contenteditable=false <span> — is NOT reliably cut by a synthetic Ctrl+X on
          // touch/mobile engines: the browser fires no `cut` event for a non-editable node
          // selection there, so the image silently survives (reproduced on the CI Tablet
          // project; cut.spec.ts:228/570). Route just that case through cutSelection(), which
          // for a node selection guarantees the removal with an explicit ProseMirror
          // transaction (best-effort native `copy` for the clipboard, never
          // navigator.clipboard). Same path as the toolbar button and Shift-Delete, so all
          // image-cut entry points behave identically and deterministically. See
          // specs/bild-groesse-aendern-req.md, specs/ausschneiden-code.md §3.3.
          'Mod-x': (state, dispatch, view) =>
            state.selection instanceof NodeSelection
              ? cutSelection({ onCutBlocked: setCutError })(state, dispatch, view)
              : false,
          // Windows' common secondary "cut" keybinding. Not something browsers
          // map to a native cut on a contenteditable by themselves (unlike
          // Ctrl+X/Cmd+X, which prosemirror-view already handles natively), so
          // it's bound explicitly to the same execCommand('cut') path as the
          // toolbar button (see commands.ts, specs/ausschneiden-code.md §3.3).
          'Shift-Delete': cutSelection({ onCutBlocked: setCutError }),
        }),
        keymap(baseKeymap),
        // BEFORE tableEditing: its arrow handler must get the first shot at Arrow-Up/-Down
        // on a boundary row, otherwise prosemirror-tables swallows the key and the caret
        // position before/after an edge table is unreachable by keyboard
        // (basis-stabilisierung-req.md B2 §2.2). From an inner row no valid gap exists, so
        // the gap-cursor handler returns false and in-table arrow navigation still runs.
        gapCursor(),
        columnResizing(),
        tableEditing(),
        // Paste/drop pipeline: plain-text line semantics, HTML sanitisation,
        // external-image → placeholder, image-blob paste/drop, "paste without
        // formatting". `setPasteNotice` is a stable React setter, so wiring it in
        // the one-time init effect is safe. See specs/einfuegen-code.md 5.3.
        createPastePlugin({ onNotice: setPasteNotice }),
        dropCursor(),
        createSearchPlugin(),
        createPaginationPlugin(),
      ],
    })

    // Rechtsklick "Ausschneiden": bewusst kein eigenes Kontextmenü und kein
    // `contextmenu`-Listener mit `preventDefault()` — das native
    // Browser-Kontextmenü bleibt erreichbar und sein "Ausschneiden"-Eintrag
    // nutzt denselben `editHandlers.cut`-Pfad wie Strg+X (siehe
    // specs/ausschneiden-code.md §1.4/§4, specs/ausschneiden-req.md Abschnitt 1).
    const view = new EditorView(containerRef.current, {
      state,
      clipboardTextSerializer,
      nodeViews: {
        image: (node, nodeView, getPos) =>
          new ImageResizeNodeView(
            node,
            nodeView,
            getPos as () => number | undefined,
            () => zoomRef.current,
            (size) => setLiveImageSize(size),
          ),
      },
      // Typing while an image is node-selected must APPEND after it, never replace it —
      // ProseMirror's default would swap the image for the typed character. This one guard
      // covers both triggers: right after inserting an image and right after resizing one
      // (bild-groesse-aendern-req.md §2.10, bild-einfuegen §3.12).
      handleTextInput(v, _from, _to, text) {
        const sel = v.state.selection
        if (sel instanceof NodeSelection && sel.node.type.name === 'image') {
          const tr = v.state.tr
          const $after = tr.doc.resolve(sel.to)
          // Prefer an existing text position right after the image; if the image is the last
          // block (nothing to append into), insert a fresh paragraph carrying the text.
          const textSel = Selection.findFrom($after, 1, true)
          if (textSel) {
            tr.setSelection(textSel).insertText(text)
          } else {
            const para = wordSchema.nodes.paragraph.create(null, wordSchema.text(text))
            tr.insert(sel.to, para)
            tr.setSelection(TextSelection.create(tr.doc, sel.to + 1 + text.length))
          }
          v.dispatch(tr.scrollIntoView())
          return true
        }
        return false
      },
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr)
        view.updateState(newState)
        if (tr.docChanged) {
          // docContentRef statt der eingefrorenen Closure-Prop: seit Kopf-/Fußzeile
          // parallel editierbar sind, würde ein Spread über den Erst-Render-Stand
          // deren jüngere Änderungen zurückrollen.
          onChangeRef.current({ ...docContentRef.current, body: newState.doc.toJSON() })
        }
        forceRender((n) => n + 1)
      },
      handleDOMEvents: {
        focus: () => {
          setFocusedHF(null) // Toolbar bindet wieder an den Haupttext
          return false
        },
      },
    })
    viewRef.current = view
    view.focus()
    forceRender((n) => n + 1)

    // A real drag needs a couple of pixels of intentional movement — a plain
    // click's mousedown/mouseup coordinates can differ by a pixel or two even
    // without any dragging (pointer jitter, sub-pixel rounding).
    const CLICK_DRAG_THRESHOLD_PX = 3
    let mouseDownPos: { x: number; y: number } | null = null
    let selectionAtMouseDown: Selection | null = null
    const onMouseDown = (event: MouseEvent) => {
      mouseDownPos = { x: event.clientX, y: event.clientY }
      selectionAtMouseDown = view.state.selection
    }
    const onMouseUp = (event: MouseEvent) => {
      const down = mouseDownPos
      const selAtDown = selectionAtMouseDown
      mouseDownPos = null
      selectionAtMouseDown = null
      if (!down) return
      const movedPx = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      if (movedPx > CLICK_DRAG_THRESHOLD_PX) return
      // The click itself already produced a selection change (ProseMirror's own click
      // handling, gapcursor's handleClick placing a fresh GapCursor, a NodeSelection on
      // an image, ...) — don't second-guess it. Only clicks that did NOT register in the
      // model by mouseup (the "man klickt hinein und nix passiert" bug, B3 — Chromium
      // sometimes leaves the click's native selection change unflushed) are repaired.
      if (selAtDown && !view.state.selection.eq(selAtDown)) return
      reconcileSelectionOnClick(view, event)
    }
    view.dom.addEventListener('mousedown', onMouseDown)
    view.dom.addEventListener('mouseup', onMouseUp)

    // Links im Editor (hyperlink-einfuegen-req.md §3.9): ein einfacher Klick setzt nur
    // den Cursor (contenteditable navigiert ohnehin nicht — und die Klick-Reparatur
    // oben bleibt dadurch unberührt); Strg/Cmd+Klick öffnet das Ziel in einem neuen
    // Tab — sonst gäbe es keinerlei Weg, einen Link testweise zu öffnen. `noopener`
    // verhindert Zugriff der Zielseite auf den Editor-Kontext.
    const onLinkClick = (event: MouseEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      const anchor = (event.target as HTMLElement).closest?.('a[href]')
      if (!anchor || !view.dom.contains(anchor)) return
      event.preventDefault()
      window.open(anchor.getAttribute('href')!, '_blank', 'noopener,noreferrer')
    }
    view.dom.addEventListener('click', onLinkClick)

    return () => {
      view.dom.removeEventListener('mousedown', onMouseDown)
      view.dom.removeEventListener('mouseup', onMouseUp)
      view.dom.removeEventListener('click', onLinkClick)
      view.destroy()
      viewRef.current = null
    }
    // Body content is only used to seed the initial state — ProseMirror owns
    // document identity from here on, re-syncing from props would fight it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // B3 (basis-stabilisierung-req.md §2.3): a click ANYWHERE on the visible sheet — the
  // white page margins and the empty area below the last block included — must focus the
  // editor and place a sensible cursor. Those regions live OUTSIDE the contenteditable
  // (they are the sheet's padding / leftover min-height), so ProseMirror never sees such
  // clicks without this handler. Clicks inside .ProseMirror are left entirely to PM.
  const focusEditorFromSheet = (event: ReactMouseEvent) => {
    const view = viewRef.current
    if (!view || view.dom.contains(event.target as Node)) return
    // Klicks in die Kopf-/Fußzeilen-Bereiche gehören deren eigenen EditorViews.
    if ((event.target as HTMLElement).closest?.('[data-testid="header-editor"], [data-testid="footer-editor"]')) return
    event.preventDefault() // keep the browser from focusing the div itself
    const doc = view.state.doc
    const editorRect = view.dom.getBoundingClientRect()
    const above = event.clientY < editorRect.top
    const below = event.clientY > editorRect.bottom
    let selection: Selection | null = null
    if (above || below) {
      // Vertically outside the content: the doc BOUNDARY is meant, never some nearby inner
      // position (posAtCoords would happily resolve into a boundary table's first/last cell).
      // A boundary table/image has no text position before/after it — there a GapCursor is
      // the correct "write here" caret (B2); next to a normal textblock the plain doc
      // start/end works. (GapCursor.valid is not part of the public typings, so the
      // equivalent check — "the boundary child is not a textblock" — is done directly.)
      const boundaryChild = above ? doc.firstChild : doc.lastChild
      if (boundaryChild && !boundaryChild.isTextblock) {
        selection = new GapCursor(above ? doc.resolve(0) : doc.resolve(doc.content.size))
      } else {
        selection = above ? Selection.atStart(doc) : Selection.atEnd(doc)
      }
    } else {
      // Side margins: land in the nearest position of the clicked line.
      const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (coords) selection = TextSelection.near(doc.resolve(coords.pos))
    }
    if (selection && !selection.eq(view.state.selection)) {
      view.dispatch(view.state.tr.setSelection(selection))
    }
    view.focus()
  }

  const activeView = viewRef.current
  const editView = targetView ?? activeView
  return (
    <div className="flex flex-col h-full">
      {activeView && editView && (
        <Toolbar
          view={editView}
          inHeaderFooter={!!focusedHF}
          headerActive={!!doc.content.header}
          footerActive={!!doc.content.footer}
          onToggleHeader={() => toggleHeaderFooter('header')}
          onToggleFooter={() => toggleHeaderFooter('footer')}
          cutError={cutError}
          setCutError={setCutError}
          onOpenTableDialog={() => setTableDialogOpen(true)}
          onOpenLinkDialog={() => setLinkDialogOpen(true)}
          onOpenSearch={() => setSearchNonce((n) => n + 1)}
          onNotice={setPasteNotice}
        />
      )}
      {activeView && searchNonce > 0 && (
        <SearchBar view={activeView} focusNonce={searchNonce} onClose={() => setSearchNonce(0)} />
      )}
      {activeView && editView && tableDialogOpen && (
        <TableSizeDialog
          onInsert={(rows, cols) => {
            setTableDialogOpen(false)
            insertTable(rows, cols)(editView.state, editView.dispatch, editView)
            editView.focus() // return focus to the editor after inserting (§2.1)
          }}
          onClose={() => {
            setTableDialogOpen(false)
            editView.focus() // return focus to the editor on cancel/escape/outside (§2.1)
          }}
        />
      )}
      {activeView && editView && linkDialogOpen && (
        <LinkDialog
          initialHref={linkAtSelection(editView.state)?.href ?? null}
          needsText={editView.state.selection.empty && !linkAtSelection(editView.state)}
          onApply={(href, text) => {
            setLinkDialogOpen(false)
            applyLink(href, text)(editView.state, editView.dispatch)
            editView.focus()
          }}
          onRemove={
            linkAtSelection(editView.state) || !editView.state.selection.empty
              ? () => {
                  setLinkDialogOpen(false)
                  removeLink()(editView.state, editView.dispatch)
                  editView.focus()
                }
              : null
          }
          onClose={() => {
            setLinkDialogOpen(false)
            editView.focus()
          }}
        />
      )}
      {activeView && selectedImage(activeView.state) && <ImageSizePanel view={activeView} liveSize={liveImageSize} />}
      {pasteNotice && (
        <div
          role="status"
          className="px-3 py-1.5 text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200"
        >
          {pasteNotice}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-neutral-200 dark:bg-neutral-950 py-6">
        {/* Scaled footprint: reserves the ZOOMED size so scroll + centring are correct
            and a phone viewport never overflows horizontally (auto-fit makes this ≤ the
            available width). `margin: 0 auto` centres it when it fits and lets it scroll
            when zoomed larger than the viewport. */}
        <div style={{ width: PAGE_WIDTH_PX * zoom, height: sheetHeight * zoom, margin: '0 auto' }}>
          <div
            ref={sheetRef}
            data-testid="page-sheet"
            onMouseDown={focusEditorFromSheet}
            style={{
              width: PAGE_WIDTH_PX,
              // B4: an empty/short document still shows one FULL A4 sheet, and the last
              // page of a longer document is padded to full page height — without this the
              // sheet was only as tall as its content (a ~210px strip for a new document).
              // border-box (Tailwind preflight) makes this the outer height incl. margins.
              minHeight: pageMinHeight,
              padding: `${PAGE_MARGIN_PX}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              ...pageBackgroundStyle(),
            }}
            className="shadow-lg"
          >
            {/* Kopf-/Fußzeile im oberen/unteren Seitenrand der ersten Seite (req §1 #3;
                Layout-Entscheidung §4 Option (a), Stufe 1 — Folgeseiten-Kopien folgen
                als eigene Scheibe, in req §10 vermerkt). Absolut positioniert: berührt
                weder Inhaltsfluss noch Paginierung. */}
            {doc.content.header && (
              <div
                className="absolute left-0 right-0"
                style={{ top: Math.round(PAGE_MARGIN_PX * 0.3), padding: `0 ${PAGE_MARGIN_PX}px` }}
              >
                <HeaderFooterEditor
                  kind="header"
                  content={doc.content.header}
                  onChange={(json) => patchDocument({ header: json as WordDocumentContent['header'] })}
                  onFocusChange={(v) => setFocusedHF((cur) => v ?? (cur && cur.dom.isConnected ? cur : null))}
                />
              </div>
            )}
            {doc.content.footer && (
              <div
                className="absolute left-0 right-0"
                style={{ bottom: Math.round(PAGE_MARGIN_PX * 0.3), padding: `0 ${PAGE_MARGIN_PX}px` }}
              >
                <HeaderFooterEditor
                  kind="footer"
                  content={doc.content.footer}
                  onChange={(json) => patchDocument({ footer: json as WordDocumentContent['footer'] })}
                  onFocusChange={(v) => setFocusedHF((cur) => v ?? (cur && cur.dom.isConnected ? cur : null))}
                />
              </div>
            )}
            <div ref={containerRef} className="word-editor-surface outline-none" />
          </div>
        </div>
      </div>
      <ZoomBar
        zoom={zoom}
        isFit={userZoom === null}
        onZoomOut={() => setUserZoom(clampZoom((userZoom ?? fitZoom) - 0.1))}
        onZoomIn={() => setUserZoom(clampZoom((userZoom ?? fitZoom) + 0.1))}
        onFit={() => setUserZoom(null)}
        onActualSize={() => setUserZoom(1)}
      />
    </div>
  )
}
