import { useId } from 'react'
import type { ReactNode } from 'react'

/** The inline panel that opens under a staff row: a titled section with the form and its actions. */
export function RowPanel({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="border-t border-border bg-surface-sunken px-4 py-4">
      <div className="max-w-xl space-y-3">
        <div>
          <h4 id={titleId} className="text-sm font-semibold text-ink">{title}</h4>
          {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}

/** The panel's buttons, primary first, with what is still missing after them. */
export function RowPanelActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-1">{children}</div>
}
