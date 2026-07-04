import { useEffect } from 'react'

/**
 * Warns the user before they lose in-memory work — this app persists nothing,
 * so closing/reloading the tab is the only way data is ever "deleted".
 */
export function useBeforeUnloadWarning(hasUnsavedWork: boolean): void {
  useEffect(() => {
    if (!hasUnsavedWork) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedWork])
}
