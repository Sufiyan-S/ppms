import { formatIstDate, localDateInputValue } from '../../utils/date'
import { formatDecimal } from '../../utils/format'
import i18n from '../../i18n'

// ── Helpers ───────────────────────────────────────────────────────────────────

export { formatCurrency as fmtAmt } from '../../utils/format'

export function fmtQty(n: number) {
  return `${formatDecimal(n)} L`
}

export function todayIso()     { return localDateInputValue() }

export function yesterdayIso() { return localDateInputValue(-1) }

export { formatIstDateTime as fmtDateTime } from '../../utils/date'

export function fmtShortDate(iso: string) {
  return formatIstDate(iso, { day: '2-digit', month: 'short', year: 'numeric' })
}

/** SHORT and OVER in the shared badge words; any other value is shown as sent. */
export function discrepancyTypeLabel(type: string | null): string {
  if (type === 'SHORT') return i18n.t('common:badges.short')
  if (type === 'OVER') return i18n.t('common:badges.over')
  return type ?? ''
}

export function fmtShortDayMonth(iso: string) {
  return formatIstDate(iso, { day: '2-digit', month: 'short' })
}
