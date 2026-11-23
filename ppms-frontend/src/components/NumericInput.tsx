import { forwardRef } from 'react'
import type { CSSProperties, InputHTMLAttributes, KeyboardEvent } from 'react'

const TEXT_ENTRY_FIELDS = [
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"])',
  'select',
  'textarea',
].join(',')

interface NumericInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Shown inside the field on the right, e.g. "L" or "kg". */
  unit?: string
}

function nextTextEntryField(current: HTMLInputElement): HTMLElement | null {
  const container = current.form ?? current.closest('[role="dialog"]') ?? document.body
  const fields = Array.from(container.querySelectorAll<HTMLInputElement>(TEXT_ENTRY_FIELDS))
    .filter((field) => !field.disabled && !field.readOnly)
  const index = fields.indexOf(current)
  return index === -1 ? null : fields[index + 1] ?? null
}

/**
 * Number field for phone entry: decimal keypad, no spinner arrows, 16px right-aligned digits so iOS does not zoom,
 * and Enter moves to the next field. Leave the placeholder out, or pass a short one such as "0".
 */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ unit, className, onKeyDown, type = 'number', inputMode = 'decimal', enterKeyHint = 'next', ...props }, ref) => {
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented || event.key !== 'Enter') return
      const next = nextTextEntryField(event.currentTarget)
      if (!next) return
      event.preventDefault()
      next.focus()
    }

    const input = (
      <input
        {...props}
        ref={ref}
        type={type}
        inputMode={inputMode}
        enterKeyHint={enterKeyHint}
        onKeyDown={handleKeyDown}
        className={`ui-numeric-input ${className ?? ''}`}
      />
    )

    if (!unit) return input
    // The field keeps room on the right for the unit, so typed digits never run under it.
    const unitWidth = { '--ui-numeric-unit-chars': unit.length } as CSSProperties
    return (
      <div className="ui-numeric-field" style={unitWidth}>
        {input}
        <span aria-hidden="true" className="ui-numeric-field__unit">{unit}</span>
      </div>
    )
  },
)

NumericInput.displayName = 'NumericInput'
