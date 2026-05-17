import { useState } from 'react'
import { X } from 'lucide-react'

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
  triggerClassName = 'ui-btn ui-btn-ghost min-h-0 p-1 text-red-400 hover:text-red-600',
  confirmClassName = 'ui-btn ui-btn-danger min-h-0 px-2 py-0.5 text-xs',
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <span className="text-xs text-red-600 font-medium">{prompt}</span>
        <button
          type="button"
          onClick={() => { onConfirm(); setConfirming(false) }}
          disabled={disabled}
          className={confirmClassName}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="ui-btn ui-btn-ghost min-h-0 px-2 py-0.5 text-xs"
        >
          No
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={disabled}
      aria-label={triggerAriaLabel}
      className={triggerClassName}
    >
      {triggerLabel ?? <X size={14} strokeWidth={2} />}
    </button>
  )
}
