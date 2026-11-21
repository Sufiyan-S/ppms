import type { CashEventType } from '../../api/cashApi'

export const EVENT_TYPES: { value: CashEventType; label: string }[] = [
  { value: 'OPENING_BALANCE', label: 'Opening Balance' },
  { value: 'CASH_IN',         label: 'Cash In' },
  { value: 'CASH_OUT',        label: 'Cash Out' },
  { value: 'CLOSING_BALANCE', label: 'Closing Balance' },
]

export const EVENT_STYLES: Record<CashEventType, string> = {
  OPENING_BALANCE: 'bg-blue-100 text-blue-700',
  CASH_IN:         'bg-emerald-100 text-emerald-700',
  CASH_OUT:        'bg-red-100 text-red-700',
  CLOSING_BALANCE: 'bg-slate-100 text-slate-700',
}

export { formatCurrency as fmtAmt } from '../../utils/format'

export { formatIstDate as fmtDate } from '../../utils/date'
