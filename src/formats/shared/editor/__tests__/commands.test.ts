import { EditorState, TextSelection, NodeSelection, AllSelection } from 'prosemirror-state'
import { wordSchema } from '../../schema'
import { canCut, cutSelection } from '../commands'

function stateWithDoc() {
  const doc = wordSchema.node('doc', null, [
    wordSchema.node('paragraph', null, [wordSchema.text('hello')]),
    wordSchema.node('image', { src: 'data:image/png;base64,' }),
  ])
  return EditorState.create({ doc, schema: wordSchema })
}

describe('canCut', () => {
  it('is false for a collapsed cursor (no selection)', () => {
    const state = stateWithDoc()
    expect(state.selection.empty).toBe(true)
    expect(canCut(state)).toBe(false)
  })

  it('is true for a non-empty TextSelection', () => {
    const state = stateWithDoc()
    const withSelection = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)))
    expect(canCut(withSelection)).toBe(true)
  })

  it('is true for a NodeSelection on an image', () => {
    const state = stateWithDoc()
    const imagePos = state.doc.child(0).nodeSize // position right after the paragraph
    const withSelection = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, imagePos)))
    expect(canCut(withSelection)).toBe(true)
  })

  it('is true for an AllSelection', () => {
    const state = stateWithDoc()
    const withSelection = state.apply(state.tr.setSelection(new AllSelection(state.doc)))
    expect(canCut(withSelection)).toBe(true)
  })
})

describe('cutSelection', () => {
  function fakeView(execCommandImpl: (cmd: string) => boolean) {
    return {
      dom: { ownerDocument: { execCommand: execCommandImpl } },
      focus: () => {},
    } as unknown as import('prosemirror-view').EditorView
  }

  it('returns false and does not touch the view when the selection is empty', () => {
    const state = stateWithDoc()
    let execCalled = false
    const view = fakeView(() => {
      execCalled = true
      return true
    })
    const dispatch = () => {}
    const result = cutSelection()(state, dispatch, view)
    expect(result).toBe(false)
    expect(execCalled).toBe(false)
  })

  it('is a pure availability check when no dispatch is given (no execCommand call)', () => {
    const state = stateWithDoc()
    const withSelection = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)))
    let execCalled = false
    const view = fakeView(() => {
      execCalled = true
      return true
    })
    const result = cutSelection()(withSelection, undefined, view)
    expect(result).toBe(true)
    expect(execCalled).toBe(false)
  })

  it('calls onCutBlocked and returns false when execCommand reports failure', () => {
    const state = stateWithDoc()
    const withSelection = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)))
    const view = fakeView(() => false)
    let blockedMessage: string | undefined
    const result = cutSelection({ onCutBlocked: (msg) => (blockedMessage = msg) })(withSelection, () => {}, view)
    expect(result).toBe(false)
    expect(blockedMessage).toBeTruthy()
  })

  it('does not call onCutBlocked when execCommand succeeds', () => {
    const state = stateWithDoc()
    const withSelection = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)))
    const view = fakeView(() => true)
    let blockedCalled = false
    const result = cutSelection({ onCutBlocked: () => (blockedCalled = true) })(withSelection, () => {}, view)
    expect(result).toBe(true)
    expect(blockedCalled).toBe(false)
  })

  it('treats a thrown exception from execCommand like a failure, without rethrowing', () => {
    const state = stateWithDoc()
    const withSelection = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)))
    const view = fakeView(() => {
      throw new Error('boom')
    })
    let blockedMessage: string | undefined
    const result = cutSelection({ onCutBlocked: (msg) => (blockedMessage = msg) })(withSelection, () => {}, view)
    expect(result).toBe(false)
    expect(blockedMessage).toBeTruthy()
  })
})
