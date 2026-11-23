import type { ReactNode } from 'react'

/** One column on phones, two from tablet width up; put long fields and notes in a FormGridFullRow. */
export function FormGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-form-grid ${className}`}>{children}</div>
}

/** A FormGrid row spanning both columns. */
export function FormGridFullRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-form-grid__full ${className}`}>{children}</div>
}
