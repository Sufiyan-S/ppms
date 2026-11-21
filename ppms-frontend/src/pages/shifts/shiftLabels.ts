import { formatIstDate, localDateInputValue } from '../../utils/date'

// ── Constants ────────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  OPEN:                                    { label: 'Open',             color: 'bg-green-100 text-green-700' },
  OPEN_OVERDUE:                            { label: 'Overdue',          color: 'bg-amber-100 text-amber-700' },
  AUTO_CLOSED_OVERDUE:                     { label: 'Auto-closed',      color: 'bg-red-100 text-red-700' },
  CLOSED_BALANCED:                         { label: 'Balanced',         color: 'bg-slate-100 text-slate-600' },
  CLOSED_DISCREPANCY_PENDING:              { label: 'Discrepancy',      color: 'bg-red-100 text-red-700' },
  CLOSED_DISCREPANCY_PENDING_APPROVAL:     { label: 'Needs Approval',   color: 'bg-orange-100 text-orange-700' },
  CLOSED_DISCREPANCY_RESOLVED:             { label: 'Resolved',         color: 'bg-slate-100 text-slate-600' },
}

export const PAGE_SIZE = 10

// ── Date helpers ─────────────────────────────────────────────────────────────


export function labelForDate(d: string): string {
  const todayStr     = localDateInputValue()
  const yesterdayStr = localDateInputValue(-1)
  const dayBeforeStr = localDateInputValue(-2)
  if (d === todayStr)     return 'Today'
  if (d === yesterdayStr) return 'Yesterday'
  if (d === dayBeforeStr) return 'Day Before Yesterday'
  return formatIstDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export { formatCurrencyOrDash as fmtAmt } from '../../utils/format'

// ── Discrepancies History ─────────────────────────────────────────────────────

export const RESOLUTION_LABELS: Record<string, string> = {
  PENDING_INVESTIGATION: 'Pending Investigation',
  SALARY_DEDUCTION:      'Salary Deduction',
  CASH_RECOVERY:         'Cash Recovery',
  WAIVED:                'Waived',
}

// ── Resolve Discrepancy Modal ─────────────────────────────────────────────────

export const RESOLUTION_OPTIONS = [
  { value: 'PENDING_INVESTIGATION', label: 'Pending Investigation' },
  { value: 'SALARY_DEDUCTION',      label: 'Salary Deduction' },
  { value: 'CASH_RECOVERY',         label: 'Cash Recovery' },
  { value: 'WAIVED',                label: 'Waived' },
]
