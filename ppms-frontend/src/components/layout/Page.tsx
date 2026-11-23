import type { ReactNode } from 'react'

/** The container every page renders into: one max width, the same gutters and the same gap between blocks. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-page-frame ${className}`}>{children}</div>
}
