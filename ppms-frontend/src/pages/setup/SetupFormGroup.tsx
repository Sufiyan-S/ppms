import { useId } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  hint?: ReactNode
  children: ReactNode
}

/** A titled card of related fields inside a setup form, with a line on what they are for. */
export function SetupFormGroup({ icon: Icon, title, hint, children }: Props) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="ui-card-plain space-y-4 p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="ui-hub-card__icon"><Icon size={18} strokeWidth={2} /></span>
        <div className="min-w-0">
          <h3 id={titleId} className="ui-section-heading">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}
