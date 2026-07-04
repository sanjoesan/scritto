import { renderHook } from '@testing-library/react'
import { useBeforeUnloadWarning } from '../useBeforeUnloadWarning'

/**
 * Unit-level coverage for Testfall 7 (speichern-exportieren-qa.md, U8) — the E2E part of
 * Testfall 7 is covered by tests/e2e/save-export-lifecycle.spec.ts, which drives the real
 * beforeunload/dialog behavior through an actual browser. This unit test isolates just the
 * hook's own listener wiring: does it call `preventDefault()` exactly when `hasUnsavedWork`
 * is true, and does it clean up its own listener on unmount / dependency change.
 */
describe('useBeforeUnloadWarning', () => {
  function dispatchBeforeUnload(): Event {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  it('prevents default only while hasUnsavedWork is true', () => {
    const { rerender } = renderHook(({ dirty }) => useBeforeUnloadWarning(dirty), {
      initialProps: { dirty: true },
    })

    const eventWhileDirty = dispatchBeforeUnload()
    expect(eventWhileDirty.defaultPrevented).toBe(true)

    rerender({ dirty: false })

    const eventAfterClean = dispatchBeforeUnload()
    expect(eventAfterClean.defaultPrevented).toBe(false)
  })

  it('re-arms after going from clean back to dirty', () => {
    const { rerender } = renderHook(({ dirty }) => useBeforeUnloadWarning(dirty), {
      initialProps: { dirty: false },
    })

    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    rerender({ dirty: true })
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)
  })

  it('stops listening after unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const addSpy = vi.spyOn(window, 'addEventListener')

    const { unmount } = renderHook(() => useBeforeUnloadWarning(true))
    const addedHandler = addSpy.mock.calls.find(([type]) => type === 'beforeunload')?.[1]
    expect(addedHandler).toBeTruthy()

    unmount()

    const removedHandler = removeSpy.mock.calls.find(([type]) => type === 'beforeunload')?.[1]
    expect(removedHandler).toBe(addedHandler)

    // After unmount, dispatching must no longer be intercepted by the (removed) handler.
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})
