import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { wordSchema } from '../../schema'
import { indentListItem, outdentListItem, isInListItem, liftFromList } from '../commands'
import { writeDocx } from '../../../docx/writer'
import { readDocx } from '../../../docx/reader'
import type { WordDocumentContent } from '../../documentModel'

// Unit-Abdeckung für specs/liste-einruecken-tab-req.md §3.1–§3.6 (Command-Semantik)
// plus die DOCX-Rundreisen-VERIFIKATION einer gleichtypigen 2-Ebenen-Kette (§5.1 —
// die Verschachtelungs-Maschinerie existierte bereits; das ODT-Pendant ist in
// odt/__tests__/roundtrip.test.ts seit jeher abgedeckt).

function para(text: string): PMNode {
  return wordSchema.node('paragraph', null, [wordSchema.text(text)])
}
function item(...content: PMNode[]): PMNode {
  return wordSchema.node('list_item', null, content)
}
function bulletList(...items: PMNode[]): PMNode {
  return wordSchema.node('bullet_list', null, items)
}
function docState(...blocks: PMNode[]): EditorState {
  return EditorState.create({ doc: wordSchema.node('doc', null, blocks), schema: wordSchema })
}
function cursorAtText(state: EditorState, text: string): EditorState {
  let found = -1
  state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.isText && node.text?.includes(text)) found = pos
    return found < 0
  })
  if (found < 0) throw new Error(`"${text}" nicht gefunden`)
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, found + 1)))
}

describe('indentListItem (Tab, §3.1–§3.3)', () => {
  it('Punkt mit vorherigem Geschwister → eine Ebene tiefer unter denselben (Typ bleibt)', () => {
    const state = cursorAtText(docState(bulletList(item(para('eins')), item(para('zwei')))), 'zwei')
    let next = state
    expect(indentListItem()(state, (tr) => (next = state.apply(tr)))).toBe(true)
    const list = next.doc.child(0)
    expect(list.type.name).toBe('bullet_list')
    expect(list.childCount).toBe(1) // "zwei" ist jetzt IN "eins" verschachtelt
    const nested = list.child(0).child(1)
    expect(nested.type.name).toBe('bullet_list')
    expect(nested.child(0).textContent).toBe('zwei')
  })

  it('allererster Punkt: konsumiert (true), aber KEIN dispatch — kein leerer Undo-Schritt (§3.2/§3.8)', () => {
    const state = cursorAtText(docState(bulletList(item(para('eins')), item(para('zwei')))), 'eins')
    let dispatched = false
    expect(indentListItem()(state, () => (dispatched = true))).toBe(true)
    expect(dispatched).toBe(false)
  })

  it('außerhalb einer Liste: false — Tab wird durchgereicht (§2 #5)', () => {
    const state = cursorAtText(docState(para('normaler Absatz')), 'normaler')
    expect(indentListItem()(state, () => {})).toBe(false)
    expect(isInListItem(state)).toBe(false)
  })

  it('Cursor mitten im Text wirkt genauso (Blockeigenschaft, §3.3)', () => {
    const base = docState(bulletList(item(para('eins')), item(para('zwei'))))
    // Cursor ans ENDE von "zwei" statt an den Anfang
    let end = -1
    base.doc.descendants((node, pos) => {
      if (node.isText && node.text === 'zwei') end = pos + node.nodeSize
      return true
    })
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, end)))
    let next = state
    expect(indentListItem()(state, (tr) => (next = state.apply(tr)))).toBe(true)
    expect(next.doc.child(0).childCount).toBe(1)
  })
})

describe('outdentListItem (Umschalt+Tab, §3.5–§3.6)', () => {
  it('verschachtelter Punkt (Ebene 2) → genau eine Ebene hoch, bleibt Listenpunkt', () => {
    const nested = bulletList(item(para('tief')))
    const state = cursorAtText(docState(bulletList(item(para('oben'), nested))), 'tief')
    let next = state
    expect(outdentListItem()(state, (tr) => (next = state.apply(tr)))).toBe(true)
    const list = next.doc.child(0)
    expect(list.type.name).toBe('bullet_list')
    expect(list.childCount).toBe(2) // "tief" ist jetzt Geschwister von "oben"
    expect(list.child(1).textContent).toBe('tief')
  })

  it('Punkt der obersten Ebene → verlässt die Liste komplett (identisch zu „Liste aufheben", §3.5)', () => {
    const state = cursorAtText(docState(bulletList(item(para('eins')), item(para('zwei')))), 'zwei')
    let viaTab = state
    outdentListItem()(state, (tr) => (viaTab = state.apply(tr)))
    let viaButton = state
    liftFromList()(state, (tr) => (viaButton = state.apply(tr)))
    expect(viaTab.doc.toJSON()).toEqual(viaButton.doc.toJSON())
    expect(viaTab.doc.child(1).type.name).toBe('paragraph')
    expect(viaTab.doc.child(1).textContent).toBe('zwei')
  })

  it('außerhalb einer Liste: false — Umschalt+Tab wird durchgereicht', () => {
    const state = cursorAtText(docState(para('absatz')), 'absatz')
    expect(outdentListItem()(state, () => {})).toBe(false)
  })
})

describe('DOCX-Rundreise gleichtypiger 2-Ebenen-Ketten (Verifikation, §5.1)', () => {
  function doc(content: unknown[]): WordDocumentContent {
    return { body: { type: 'doc', content }, header: null, footer: null, meta: { title: '' } }
  }

  it.each(['bullet_list', 'ordered_list'] as const)('%s: Ebene-2-Punkt bleibt Ebene 2 samt Typ', async (kind) => {
    const original = doc([
      {
        type: kind,
        content: [
          {
            type: 'list_item',
            content: [
              { type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: 'Ebene 1' }] },
              {
                type: kind,
                content: [
                  {
                    type: 'list_item',
                    content: [{ type: 'paragraph', attrs: { align: 'left' }, content: [{ type: 'text', text: 'Ebene 2' }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
    const result = await readDocx(await writeDocx(original))
    const list = (result.body as { content: Array<{ type: string; content: unknown[] }> }).content[0]
    expect(list.type).toBe(kind)
    const outerItem = list.content[0] as { content: Array<{ type: string; content?: unknown[] }> }
    const nested = outerItem.content.find((n) => n.type === kind) as { content: Array<{ content: Array<{ content: Array<{ text: string }> }> }> }
    expect(nested).toBeTruthy()
    expect(nested.content[0].content[0].content[0].text).toBe('Ebene 2')
  })
})
