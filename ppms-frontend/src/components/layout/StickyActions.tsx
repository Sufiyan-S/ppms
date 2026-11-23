import type { ReactNode } from 'react'

/** The action bar that stays at the bottom of a long form or full-page flow, clear of the phone's home indicator. */
export function StickyActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-sticky-actions ${className}`}>{children}</div>
}
