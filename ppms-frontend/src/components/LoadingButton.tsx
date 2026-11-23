import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading: boolean
  /** Read out instead of the label while loading, e.g. "Closing shift". */
  loadingLabel: string
  children: ReactNode
}

/** A `ui-btn` that keeps its label's width while busy: the label is hidden in place and a spinner sits over it. */
export function LoadingButton({ isLoading, loadingLabel, children, className = '', disabled, ...rest }: Props) {
  return (
    <button {...rest} disabled={disabled || isLoading} aria-busy={isLoading || undefined}
      className={`ui-btn ${className}`}>
      <span className="ui-btn-label">{children}</span>
      {isLoading && (
        <span className="ui-btn-spinner">
          <Spinner />
          <span className="sr-only">{loadingLabel}</span>
        </span>
      )}
    </button>
  )
}
