import type { CSSProperties, ReactNode } from 'react'

/** Headline figures: one per row on phones, two on tablets, up to four across on desktop. */
export function KpiRow({ label, columns = 4, children }: { label: string; columns?: 2 | 3 | 4; children: ReactNode }) {
  return (
    <section aria-label={label} className="ui-kpi-row" style={{ '--kpi-columns': columns } as CSSProperties}>
      {children}
    </section>
  )
}

/** Two blocks side by side on desktop and stacked below it; a single block takes the full width. */
export function DashboardColumns({ children }: { children: ReactNode }) {
  return <div className="ui-dashboard-columns">{children}</div>
}
