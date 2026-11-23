import { useId } from 'react'
import type { ReactNode, Ref } from 'react'

interface PageSectionProps {
  title: ReactNode
  /** Shown right after the title, e.g. a last-updated indicator. */
  titleMeta?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** Content reaches the card edges, for tables and lists. */
  flush?: boolean
  headingLevel?: 2 | 3
  className?: string
  ref?: Ref<HTMLElement>
  children: ReactNode
}

/** A titled card on a page: heading, optional note and actions in the head, content below. */
export function PageSection({ title, titleMeta, description, actions, flush = false, headingLevel = 2, className = '', ref, children }: PageSectionProps) {
  const headingId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <section ref={ref} aria-labelledby={headingId} className={`ui-page-section ${className}`}>
      <div className="ui-page-section__head">
        <div className="ui-page-section__title-row">
          <Heading id={headingId} className="ui-page-section__title">{title}</Heading>
          {titleMeta}
        </div>
        {actions && <div className="ui-page-section__actions">{actions}</div>}
        {description && <p className="ui-page-section__description">{description}</p>}
      </div>
      <div className={flush ? 'ui-page-section__body--flush' : 'ui-page-section__body'}>{children}</div>
    </section>
  )
}
