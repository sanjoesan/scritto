import type { Slice, Node as PMNode } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'

/**
 * Builds a sensible plain-text (`text/plain`) clipboard representation.
 * ProseMirror's default (`slice.content.textBetween(0, size, "\n\n")`)
 * separates every block with a blank line but has no notion of table/list
 * structure — a 2x2 table and a three-item list both collapse into an
 * indistinguishable chain of paragraphs. See specs/kopieren-code.md
 * Abschnitt 0.2, Befund B.
 *
 * Deliberately NO `navigator.clipboard` access here or anywhere else in this
 * module — see specs/kopieren-req.md Abschnitt 1, Tabellenzeile 8
 * ("Programmatischer Zugriff der App über `navigator.clipboard`" → bewusst
 * kein Soll-Verhalten). (Anchored to that stable table row rather than a line
 * number, which drifts as the spec is edited.) This function is only ever
 * invoked by ProseMirror's own native `copy`/`cut` DOM event handler via the
 * `clipboardTextSerializer` EditorProps hook.
 */
export function clipboardTextSerializer(slice: Slice, _view: EditorView): string {
  // `prosemirror-tables`' `CellSelection.content()` (a "whole cells" selection,
  // as opposed to a plain text selection inside one cell — see
  // specs/kopieren-code.md Entscheidung 2.3) returns a Slice whose top-level
  // fragment is a bare run of `table_row` nodes, NOT wrapped in a `table`
  // node — that wrapping is deliberately left "open" so ProseMirror's own
  // paste logic can re-close it against whatever context it lands in. Left
  // unhandled, each cell would fall through to the generic per-block case
  // below and get joined with a single newline like independent paragraphs
  // ("A1\nB1" instead of "A1\tB1"), making a cell-range copy indistinguishable
  // from copying two separate lines. So a run of top-level `table_row` nodes
  // is grouped and treated exactly like the rows of a `table` node.
  const parts: string[] = []
  let rowRun: PMNode[] = []
  const flushRowRun = () => {
    if (rowRun.length === 0) return
    parts.push(rowRun.map(rowToPlainText).join('\n'))
    rowRun = []
  }
  slice.content.forEach((node) => {
    if (node.type.name === 'table_row') {
      rowRun.push(node)
    } else {
      flushRowRun()
      parts.push(nodeToPlainText(node))
    }
  })
  flushRowRun()
  return parts.join('\n\n')
}

function nodeToPlainText(node: PMNode): string {
  if (node.isText) return node.text ?? ''
  if (node.isLeaf) {
    const leafText = node.type.spec.leafText
    return leafText ? leafText(node) : ''
  }
  switch (node.type.name) {
    case 'table':
      return tableToPlainText(node)
    case 'bullet_list':
    case 'ordered_list':
      return listToPlainText(node)
    default:
      // paragraph, heading, list_item/table_cell content, or unknown future
      // block types: ProseMirror's own logic is sufficient here now that
      // hard_break.leafText is set (see schema.ts).
      return node.textBetween(0, node.content.size, '\n')
  }
}

function rowToPlainText(row: PMNode): string {
  const cells: string[] = []
  row.forEach((cell) => cells.push(nodeToPlainText(cell).replace(/\n/g, ' ')))
  return cells.join('\t')
}

function tableToPlainText(table: PMNode): string {
  const rows: string[] = []
  table.forEach((row) => rows.push(rowToPlainText(row)))
  return rows.join('\n')
}

function listToPlainText(list: PMNode, depth = 0): string {
  const lines: string[] = []
  const ordered = list.type.name === 'ordered_list'
  let index = (list.attrs.start as number | undefined) ?? 1
  list.forEach((item) => {
    const marker = ordered ? `${index}. ` : '- '
    const indent = '  '.repeat(depth)
    const itemLines: string[] = []
    item.forEach((child) => {
      if (child.type.name === 'bullet_list' || child.type.name === 'ordered_list') {
        itemLines.push(listToPlainText(child, depth + 1))
      } else {
        itemLines.push(nodeToPlainText(child))
      }
    })
    lines.push(indent + marker + itemLines.join('\n' + indent + '  '))
    index += 1
  })
  return lines.join('\n')
}
