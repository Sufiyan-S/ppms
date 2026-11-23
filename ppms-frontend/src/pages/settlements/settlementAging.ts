import type { PendingSettlementRange, SettlementPaymentType } from '../../api/paymentSettlementApi'
import { formatIstDate } from '../../utils/date'
import { translateKey } from '../../i18n'

/** "18–20 Nov", "30 Nov – 2 Dec", or "18 Nov" for a single day. */
export function collectionDaysLabel(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return formatIstDate(fromDate, { day: 'numeric', month: 'short' })
  if (fromDate.slice(0, 7) === toDate.slice(0, 7)) {
    return `${Number(fromDate.slice(8))}–${formatIstDate(toDate, { day: 'numeric', month: 'short' })}`
  }
  return `${formatIstDate(fromDate, { day: 'numeric', month: 'short' })} – ${formatIstDate(toDate, { day: 'numeric', month: 'short' })}`
}

export function ageLabel(ageDays: number): string {
  if (ageDays <= 0) return translateKey('settlements:pendingByAge.today')
  return translateKey('settlements:pendingByAge.days', { count: ageDays })
}

export interface CoveredDay {
  date: string
  covered: number
  unsettled: number
}

/** The collection days a new settlement of this amount would clear, oldest first, the way the server allocates it. */
export function daysCoveredBy(ranges: PendingSettlementRange[], type: SettlementPaymentType, amount: number): CoveredDay[] {
  const days = ranges
    .filter((range) => range.paymentType === type)
    .flatMap((range) => range.days)
    .sort((a, b) => a.date.localeCompare(b.date))
  const covered: CoveredDay[] = []
  let remaining = Math.round(amount * 100)
  for (const day of days) {
    if (remaining <= 0) break
    const unsettled = Math.round(day.amount * 100)
    const applied = Math.min(unsettled, remaining)
    covered.push({ date: day.date, covered: applied / 100, unsettled: unsettled / 100 })
    remaining -= applied
  }
  return covered
}
