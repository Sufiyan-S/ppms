import { useId, useLayoutEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { groupPhoneDigits, isCompletePhone, phoneDigits } from './phoneDigits'

interface PhoneNumberFieldProps {
  id: string
  /** The 10 digits only; the field shows them grouped as "98765 43210". */
  value: string
  onChange: (digits: string) => void
  onBlur?: () => void
  inputRef?: (element: HTMLInputElement | null) => void
  placeholder?: string
  error?: string
  readOnly?: boolean
}

function caretPosition(digitsBeforeCaret: number): number {
  return digitsBeforeCaret > 5 ? digitsBeforeCaret + 1 : digitsBeforeCaret
}

/** An Indian mobile number: a fixed +91 in front, digits grouped 5 + 5, and a tick once all 10 are in. */
export function PhoneNumberField({ id, value, onChange, onBlur, inputRef, placeholder, error, readOnly }: PhoneNumberFieldProps) {
  const { t } = useTranslation('auth')
  const hintId = useId()
  const errorId = `${id}-error`
  const inputElement = useRef<HTMLInputElement | null>(null)
  const pendingCaret = useRef<number | null>(null)

  // Regrouping rewrites the text, which would otherwise throw the caret to the end while editing in the middle.
  useLayoutEffect(() => {
    const input = inputElement.current
    if (pendingCaret.current !== null && input && input === document.activeElement) {
      input.setSelectionRange(pendingCaret.current, pendingCaret.current)
    }
    pendingCaret.current = null
  })

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value
    const digits = phoneDigits(text)
    const caret = event.target.selectionStart ?? text.length
    const digitsBeforeCaret = Math.min(text.slice(0, caret).replace(/\D/g, '').length, digits.length)
    pendingCaret.current = caretPosition(digitsBeforeCaret)
    onChange(digits)
  }

  const complete = isCompletePhone(value)

  return (
    <div>
      <label htmlFor={id} className="ui-label">{t('fields.phoneNumber')}</label>
      <div className="ui-auth-phone">
        <span className="ui-auth-phone__prefix" aria-hidden="true">+91</span>
        <input
          id={id}
          ref={(element) => {
            inputElement.current = element
            inputRef?.(element)
          }}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={groupPhoneDigits(value)}
          onChange={handleChange}
          onBlur={onBlur}
          placeholder={placeholder}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        />
        {complete && <Check size={18} strokeWidth={2.5} aria-hidden="true" className="ui-auth-phone__check" />}
      </div>
      <p id={hintId} className="sr-only">{t('phoneField.prefixHint')}</p>
      {error && <p id={errorId} className="ui-error-text" role="alert">{error}</p>}
    </div>
  )
}
