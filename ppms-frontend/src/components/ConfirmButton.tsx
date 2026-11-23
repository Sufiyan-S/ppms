import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  triggerAriaLabel,
  prompt,
  triggerClassName,
  confirmClassName = 'ui-btn ui-btn-danger min-h-0 px-2 py-0.5 text-xs',
}: ConfirmButtonProps) {
  const { t } = useTranslation()
  const triggerName = triggerAriaLabel ?? t('actions.delete')
  const promptText = prompt ?? t('confirm.deletePrompt')
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
      <span role="group" aria-label={promptText} className="flex items-center gap-1">
        <span className="text-xs text-bad font-medium">{promptText}</span>
        <button
          type="button"
          onClick={() => { onConfirm(); close() }}
          onKeyDown={closeOnEscape}
          disabled={disabled}
          className={confirmClassName}
        >
          {t('actions.yes')}
        </button>
        <button
          ref={noRef}
          type="button"
          onClick={close}
          onKeyDown={closeOnEscape}
          className="ui-btn ui-btn-ghost min-h-6 px-2 py-0.5 text-xs"
        >
          {t('actions.no')}
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
        aria-label={triggerName}
        className={triggerClassName ?? 'ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-bad hover:text-bad-strong'}
      >
        {triggerLabel}
      </button>
    )
  }

  return (
    <IconButton
      ref={triggerRef}
      label={triggerName}
      icon={<X size={14} strokeWidth={2} />}
      onClick={() => setConfirming(true)}
      disabled={disabled}
      className={triggerClassName ?? 'ui-btn ui-btn-ghost text-bad hover:text-bad-strong'}
    />
  )
}
