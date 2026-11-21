import type { AncillaryPaymentMode, UnitOfMeasure } from '../../api/ancillaryApi'

// ── Helpers ─────────────────────────────────────────────────────────────────

export function fmtCurrency(n: number | null | undefined) {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export { formatIstDate as fmtDate } from '../../utils/date'

export const PAYMENT_MODES: AncillaryPaymentMode[] = ['CASH', 'UPI', 'CARD', 'FLEET_CARD', 'CREDIT']

export const UNITS: UnitOfMeasure[] = ['LITRE', 'KG', 'PIECE']
