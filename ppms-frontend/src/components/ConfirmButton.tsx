import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

interface ConfirmButtonProps {
  onConfirm: () => void
  disabled?: boolean
  /** Label shown on the initial trigger button. Defaults to a trash/X icon. */
  triggerLabel?: string
  /** aria-label for the trigger button (screen-reader text) */
  triggerAriaLabel?: string
  /** Confirmation prompt text shown inline */
  prompt?: string
  /** Tailwind classes for the trigger button */
  triggerClassName?: string
  /** Tailwind classes for the confirm (Yes) button */
  confirmClassName?: string
}

/**
 * A two-step inline confirmation button.
 *
 * Renders as a single icon button. On first click it expands to show
 * "Prompt? [Yes] [No]" inline. Pressing Yes calls onConfirm; No collapses back.
 * This avoids disruptive confirm dialogs for row-level destructive actions.
 */
export function ConfirmButton({
  onConfirm,
  disabled = false,
  triggerLabel,
  triggerAriaLabel = 'Delete',
  prompt = 'Delete?',
  triggerClassName,
  confirmClassName = 'ui-btn ui-btn-danger min-h-0 px-2 py-0.5 text-xs',
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const noRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const returnFocusToTrigger = useRef(false)

  useEffect(() => {
    if (confirming) {
      noRef.current?.focus()
    } else if (returnFocusToTrigger.current) {
      returnFocusToTrigger.current = false
      triggerRef.current?.focus()
    }
  }, [confirming])

  function close() {
    returnFocusToTrigger.current = true
    setConfirming(false)
  }

  function closeOnEscape(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    close()
  }

  if (confirming) {
    return (
      <span role="group" aria-label={prompt} className="flex items-center gap-1">
        <span className="text-xs text-red-600 font-medium">{prompt}</span>
        <button
          type="button"
          onClick={() => { onConfirm(); close() }}
          onKeyDown={closeOnEscape}
          disabled={disabled}
          className={confirmClassName}
        >
          Yes
        </button>
        <button
          ref={noRef}
          type="button"
          onClick={close}
          onKeyDown={closeOnEscape}
          className="ui-btn ui-btn-ghost min-h-6 px-2 py-0.5 text-xs"
        >
          No
        </button>
      </span>
    )
  }

  if (triggerLabel) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled}
        aria-label={triggerAriaLabel}
        className={triggerClassName ?? 'ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-red-500 hover:text-red-700'}
      >
        {triggerLabel}
      </button>
    )
  }

  return (
    <IconButton
      ref={triggerRef}
      label={triggerAriaLabel}
      icon={<X size={14} strokeWidth={2} />}
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className={triggerClassName ?? 'ui-btn ui-btn-ghost text-red-500 hover:text-red-700'}
    />
  )
}
