import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Holds a dialog open when the user has typed or changed anything inside it and then tries to close it,
 * so the caller can ask "Discard your changes?" first. Changes are noticed from input and change events
 * bubbling up to the container. `requestClose` returns true when it went on to close.
 */
export function useDiscardGuard(containerRef: RefObject<HTMLElement | null>, isEnabled: boolean, close: () => void) {
  const [isConfirming, setIsConfirming] = useState(false)
  const hasChangesRef = useRef(false)
  const focusBeforeConfirmRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const markChanged = () => {
      hasChangesRef.current = true
    }
    container.addEventListener('input', markChanged)
    container.addEventListener('change', markChanged)
    return () => {
      container.removeEventListener('input', markChanged)
      container.removeEventListener('change', markChanged)
    }
  }, [containerRef])

  const keepEditing = useCallback(() => setIsConfirming(false), [])

  const requestClose = useCallback((): boolean => {
    if (isConfirming) {
      keepEditing()
      return false
    }
    if (isEnabled && hasChangesRef.current) {
      focusBeforeConfirmRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setIsConfirming(true)
      return false
    }
    close()
    return true
  }, [isConfirming, isEnabled, keepEditing, close])

  const discard = useCallback(() => {
    hasChangesRef.current = false
    focusBeforeConfirmRef.current = null
    setIsConfirming(false)
    close()
  }, [close])

  useEffect(() => {
    const target = focusBeforeConfirmRef.current
    if (isConfirming || !target) return
    focusBeforeConfirmRef.current = null
    const container = containerRef.current
    const fallback = container?.querySelector<HTMLElement>('.ui-modal-close')
    ;(target.isConnected && container?.contains(target) ? target : fallback)?.focus()
  }, [isConfirming, containerRef])

  return { isConfirming, requestClose, keepEditing, discard }
}
