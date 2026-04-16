import type { ReactNode } from 'react'
import { useScrollReveal } from '../hooks/useScrollReveal'

interface RevealProps {
  /** Content to reveal */
  children: ReactNode
  /** Stagger delay in ms — use multiples of ~70ms for a natural cascade */
  delay?: number
  /** Extra classes forwarded to the wrapper div */
  className?: string
}

/**
 * Wraps children in a div that fades + slides up into view when it enters
 * the viewport. Uses IntersectionObserver so it fires at scroll time, not
 * just on mount. For short pages where everything is immediately visible,
 * this behaves as a staggered entrance animation.
 *
 * Usage:
 *   <Reveal delay={80}>
 *     <div className="ui-card">...</div>
 *   </Reveal>
 */
export function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const ref = useScrollReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={`ui-reveal ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
