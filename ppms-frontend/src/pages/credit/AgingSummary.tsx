import { useTranslation } from 'react-i18next'
import type { CreditAging } from '../../api/creditApi'
import { KpiRow } from '../../components/layout/DashboardGrid'
import { formatCurrency } from '../../utils/format'

function SummaryFigure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="ui-dashboard-module px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${tone ?? 'text-ink'}`}>{value}</p>
    </div>
  )
}

/** Total owed, how much of it is overdue and how much is older than 60 days. */
export function AgingSummary({ summary }: { summary: CreditAging['summary'] }) {
  const { t } = useTranslation('credit')
  return (
    <KpiRow label={t('aging.summaryLabel')} columns={3}>
      <SummaryFigure label={t('aging.totalOutstanding')} value={formatCurrency(summary.totalOutstanding)} />
      <SummaryFigure label={t('aging.filters.overdue')} value={formatCurrency(summary.overdueAmount)}
        tone={summary.overdueAmount > 0 ? 'text-bad' : undefined} />
      <SummaryFigure label={t('aging.olderThan60')} value={formatCurrency(summary.overSixtyAmount)}
        tone={summary.overSixtyAmount > 0 ? 'text-warn' : undefined} />
    </KpiRow>
  )
}
