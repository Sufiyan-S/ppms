import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DatePresetChips } from '../../components/DatePresetChips'
import { FilterBar } from '../../components/layout/FilterBar'
import { KpiRow } from '../../components/layout/DashboardGrid'
import type { DateRange } from '../../utils/datePresets'


export function PrintHeader({ title, from, to }: { title: string; from?: string; to?: string }) {
  const { t } = useTranslation(['reports', 'common'])
  return (
    <div className="mb-4 border-b border-border pb-3">
      <h2 className="ui-title-sm">{title}</h2>
      {(from || to) && <p className="ui-help">{t('controls.period', { from: from ?? '—', to: to ?? '—' })}</p>}
    </div>
  )
}

export function DateRangeInputs({
  from, to, onFromChange, onToChange, onPreset,
}: {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  /** When given, quick-range chips are shown and a chosen range is applied straight away. */
  onPreset?: (range: DateRange) => void
}) {
  const { t } = useTranslation(['reports', 'common'])
  return (
    <>
      {onPreset && <div className="basis-full"><DatePresetChips range={{ from, to }} onSelect={onPreset} /></div>}
      <div>
        <label className="block">
          <span className="ui-label">{t('common:fields.from')}</span>
          <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)}
            className="min-w-40 shadow-sm" />
        </label>
      </div>
      <div>
        <label className="block">
          <span className="ui-label">{t('common:fields.to')}</span>
          <input type="date" value={to} onChange={(e) => onToChange(e.target.value)}
            className="min-w-40 shadow-sm" />
        </label>
      </div>
    </>
  )
}

/** The one row of report filters and actions above a report; not printed. */
export function ReportFilterBar({ children }: { children: ReactNode }) {
  const { t } = useTranslation('reports')
  return (
    <FilterBar label={t('controls.filtersLabel')} className="rounded-card border border-border print:hidden">
      <div className="ui-filter-group w-full">{children}</div>
    </FilterBar>
  )
}

export function ReportSummary({ columns, children }: { columns: 2 | 3; children: ReactNode }) {
  const { t } = useTranslation('reports')
  return <KpiRow label={t('controls.summaryLabel')} columns={columns}>{children}</KpiRow>
}

export function SummaryCard({ label, value, color, note }: { label: string; value: ReactNode; color: string; note?: ReactNode }) {
  return (
    <div className="ui-card ui-card-muted p-4">
      <p className="ui-kpi-label mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {note}
    </div>
  )
}

/** Shown instead of ₹0.00 cards when the default range has nothing in it, pointing at a range that likely does. */
export function EmptyRangeSuggestion({ message, onShowLastMonth }: { message: string; onShowLastMonth: () => void }) {
  const { t } = useTranslation(['reports', 'common'])
  return (
    <div className="ui-card ui-card-muted flex flex-col items-center gap-3 p-6 text-center" role="status">
      <p className="text-sm font-medium text-ink">{message}</p>
      <p className="text-xs text-ink-3">{t('emptyRange.earlierDays')}</p>
      <button type="button" className="ui-btn ui-btn-secondary" onClick={onShowLastMonth}>{t('emptyRange.showLastMonth')}</button>
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="ui-alert ui-alert-danger text-sm" role="alert">{message}</div>
  )
}
