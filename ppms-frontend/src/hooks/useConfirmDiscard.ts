import { useCallback, useState } from 'react'

/**
 * Wraps a modal's close action so unsaved entries are not thrown away by a stray Escape or backdrop click.
 * While `isConfirming` is true the caller renders a DiscardChangesDialog wired to `discard` and `keepEditing`.
 */
export function useConfirmDiscard(hasUnsavedChanges: boolean, onClose: () => void) {
  const [isConfirming, setIsConfirming] = useState(false)

  const requestClose = useCallback(() => {
    if (hasUnsavedChanges) setIsConfirming(true)
    else onClose()
  }, [hasUnsavedChanges, onClose])

  const discard = useCallback(() => {
    setIsConfirming(false)
    onClose()
  }, [onClose])

  const keepEditing = useCallback(() => setIsConfirming(false), [])

  return { requestClose, isConfirming, discard, keepEditing }
}
