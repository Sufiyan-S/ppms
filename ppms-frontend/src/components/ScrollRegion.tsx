import type { ReactNode } from 'react'

/**
 * A horizontally scrolling table wrapper that keyboard users can focus and scroll, named for screen readers.
 * An edge shadow shows when more content is hidden to either side.
 */
export function ScrollRegion({ label, className, children }: { label: string; className: string; children: ReactNode }) {
  return (
    <div className={`ui-scroll-region ${className}`} role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}
