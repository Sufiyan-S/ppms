import { useState, forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Drop-in replacement for <input type="password">.
 *
 * Renders a password field with a show/hide toggle eye button on the right.
 * Uses forwardRef so react-hook-form's register() spread works correctly.
 *
 * Usage (controlled):
 *   <PasswordInput value={pw} onChange={e => setPw(e.target.value)} />
 *
 * Usage (react-hook-form):
 *   <PasswordInput {...register('password')} />
 */
interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Accessible name of the show/hide toggle; override when the field holds something other than a password. */
  toggleLabel?: string
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleLabel, ...props }, ref) => {
    const { t } = useTranslation()
    const [visible, setVisible] = useState(false)

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          type={visible ? 'text' : 'password'}
          // pr-10 reserves space so text never hides behind the eye button
          className={`pr-10 ${className ?? ''}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={toggleLabel ?? t('passwordInput.show')}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-3 hover:text-ink transition-colors"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
