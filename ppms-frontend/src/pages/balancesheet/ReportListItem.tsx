import { TrendingDown, TrendingUp } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import type { BalanceSheetSummary } from '../../api/balanceSheetApi'
import { fmtDate, fmtLitres, fmtMoney } from './bsFormat'

// ── Report list item ────────────────────────────────────────────────────────────

interface ReportListItemProps {
  report: BalanceSheetSummary
  isSelected: boolean
  onClick: () => void
}

export function ReportListItem({ report, isSelected, onClick }: ReportListItemProps) {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isDay = report.reportType === 'DAY'
  const discrepancyColor = report.cashDiscrepancy === 0
    ? 'text-emerald-600'
    : report.cashDiscrepancy < 0
      ? 'text-red-500'
      : 'text-amber-500'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors ${
        isSelected ? 'bg-blue-50/80 border-l-2 border-l-blue-500 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
              isDay ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {isDay ? 'Day' : 'Shift'}
            </span>
            <span className="text-sm font-medium text-slate-700 truncate">{report.periodLabel}</span>
          </div>
          <p className="text-xs text-slate-500">{fmtDate(report.reportDate)}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {report.shiftCount} shift{report.shiftCount !== 1 ? 's' : ''} · {fmtLitres(report.totalLitresSold)} sold
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-slate-700">{fmtMoney(report.totalExpectedRevenue)}</p>
          <p className={`text-xs font-medium ${discrepancyColor}`}>
            {report.cashDiscrepancy === 0
              ? 'Balanced'
              : <span className="inline-flex items-center gap-0.5">{report.cashDiscrepancy < 0 ? <TrendingDown size={12} strokeWidth={2} /> : <TrendingUp size={12} strokeWidth={2} />}{fmtMoney(Math.abs(report.cashDiscrepancy))}</span>}
          </p>
          {isOwnerOrAdmin && <p className="text-xs text-emerald-600">{fmtMoney(report.totalGrossProfit)} profit</p>}
        </div>
      </div>
    </button>
  )
}
