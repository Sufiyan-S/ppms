import type { ReactNode } from 'react'

/** The summary on a review step; fill it with ReviewRow. */
export function ReviewList({ children }: { children: ReactNode }) {
  return <dl className="ui-card-plain ui-card-muted divide-y divide-border overflow-hidden text-sm">{children}</dl>
}

export function ReviewRow({ label, value, isResult = false }: { label: string; value: ReactNode; isResult?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className={isResult ? 'font-semibold text-ink' : 'text-ink-2'}>{label}</dt>
      <dd className={`text-right break-words ${isResult ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>{value ?? '—'}</dd>
    </div>
  )
}
