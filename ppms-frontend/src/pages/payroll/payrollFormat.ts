import type { PayrollStatus } from '../../api/payrollApi'
import { localDateInputValue } from '../../utils/date'

export const STATUS_STYLES: Record<PayrollStatus, string> = {
  DRAFT:    'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID:     'bg-emerald-100 text-emerald-700',
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
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' })
}

export function todayIso()     { return localDateInputValue() }

export function yesterdayIso() { return localDateInputValue(-1) }
