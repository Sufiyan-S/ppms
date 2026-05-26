import { useEffect } from 'react'

/**
 * Calls `onClose` when the Escape key is pressed.
 * Pass `enabled = false` to disable while the modal is not mounted or while a
 * nested confirmation is open (so only the innermost layer closes).
 */
export function useEscapeKey(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, enabled])
}
