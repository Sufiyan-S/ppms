import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Accessible name, also shown as the hover tooltip. */
  label: string
  icon: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon, className = 'ui-btn ui-btn-ghost', type = 'button', ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      type={type}
      aria-label={label}
      title={props.title ?? label}
      className={`ui-btn-icon ${className}`}
    >
      <span aria-hidden="true" className="inline-flex">{icon}</span>
    </button>
  ),
)

IconButton.displayName = 'IconButton'
