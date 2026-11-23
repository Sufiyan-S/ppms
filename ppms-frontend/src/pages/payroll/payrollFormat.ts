import { Check, Hourglass, Wallet } from 'lucide-react'
import type { PayrollStatus } from '../../api/payrollApi'
import type { StatusBadgeSpec } from '../../components/statusBadges'
import { codeLabel } from '../../constants/labels'
import { localDateInputValue } from '../../utils/date'
import { formatDateTimeIn } from '../../i18n/format'

const STATUS_BADGE_STYLES: Record<PayrollStatus, Omit<StatusBadgeSpec, 'label'>> = {
  DRAFT:    { tone: 'warn', icon: Hourglass },
  APPROVED: { tone: 'info', icon: Check },
  PAID:     { tone: 'ok', icon: Wallet },
}

export function statusBadge(status: PayrollStatus): StatusBadgeSpec {
  return { ...STATUS_BADGE_STYLES[status], label: codeLabel(status) }
}

// Order in which status groups are displayed
export const STATUS_ORDER: PayrollStatus[] = ['DRAFT', 'APPROVED', 'PAID']

export const NEXT_STATUS: Partial<Record<PayrollStatus, PayrollStatus>> = {
  DRAFT:    'APPROVED',
  APPROVED: 'PAID',
}

export { formatCurrency as fmtAmt } from '../../utils/format'

export { formatIstDate as fmtDate } from '../../utils/date'

/** Returns "2026-04" from a date string */
export function toMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** Returns "Apr 2026" from "2026-04" */
export function fmtMonthKey(key: string): string {
  const [year, month] = key.split('-')
  return formatDateTimeIn(new Date(Number(year), Number(month) - 1, 1), { month: 'short', year: 'numeric' })
}

export function todayIso()     { return localDateInputValue() }

export function yesterdayIso() { return localDateInputValue(-1) }

/** Calendar days from one ISO date to another, both included; null when either is missing or the end comes first. */
export function periodDays(from: string, to: string): number | null {
  if (!from || !to) return null
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  return Number.isFinite(days) && days > 0 ? days : null
}
