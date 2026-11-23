import { Link } from 'react-router-dom'
import { RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { serverText } from '../../utils/serverText'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import type { BalanceSheetSummary } from '../../api/balanceSheetApi'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { fmtDate, fmtLitres } from './bsFormat'

interface ReportListItemProps {
  report: BalanceSheetSummary
  /** Address search that opens this sheet, e.g. ?sheet=7. */
  search: string
  isSelected: boolean
}

export function ReportListItem({ report, search, isSelected }: ReportListItemProps) {
  const { t } = useTranslation('balancesheet')
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isDay = report.reportType === 'DAY'
  const discrepancyColor = report.cashDiscrepancy === 0
    ? 'text-ok'
    : report.cashDiscrepancy < 0
      ? 'text-bad'
      : 'text-warn'

  return (
    <Link to={{ search }} aria-current={isSelected ? 'page' : undefined} className="ui-list-item">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <StatusBadge tone={isDay ? 'neutral' : 'info'} label={isDay ? t('list.day') : t('list.shift')} />
          <span className="text-sm font-medium text-ink truncate">{serverText(report.periodLabelCode, report.periodLabelParams, report.periodLabel)}</span>
        </div>
        {report.stale && (
          <StatusBadge tone="warn" icon={RefreshCw} label={t('list.stale')} className="mb-0.5" />
        )}
        <p className="text-xs text-ink-3">{fmtDate(report.reportDate)}</p>
        <p className="text-xs text-ink-3 mt-0.5">
          {t('list.shiftsSold', { count: report.shiftCount, litres: fmtLitres(report.totalLitresSold) })}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <MoneyText value={report.totalExpectedRevenue} className="block text-sm font-semibold text-ink" />
        <p className={`text-xs font-medium ${discrepancyColor}`}>
          {report.cashDiscrepancy === 0
            ? t('list.balanced')
            : <span className="inline-flex items-center gap-0.5">{report.cashDiscrepancy < 0 ? <TrendingDown size={12} strokeWidth={2} /> : <TrendingUp size={12} strokeWidth={2} />}<MoneyText value={Math.abs(report.cashDiscrepancy)} /></span>}
        </p>
        {isOwnerOrAdmin && <p className="text-xs text-ok"><MoneyText value={report.totalGrossProfit} /> {t('list.profitSuffix')}</p>}
      </div>
    </Link>
  )
}
