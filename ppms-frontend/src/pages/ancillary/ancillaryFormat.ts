import { Banknote, CircleDot, CreditCard, HandCoins, Smartphone, Truck } from 'lucide-react'
import type { AncillaryPaymentMode, UnitOfMeasure } from '../../api/ancillaryApi'
import type { StatusBadgeSpec } from '../../components/statusBadges'
import { codeLabel } from '../../constants/labels'
import { formatCurrency } from '../../utils/format'

// ── Helpers ─────────────────────────────────────────────────────────────────

export function fmtCurrency(n: number | null | undefined) {
  if (n == null) return '—'
  return formatCurrency(n)
}

export { formatIstDate as fmtDate } from '../../utils/date'

/** The typed selling price as a number, or null unless it is above zero with at most two decimals. */
export function parseSellingPrice(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const price = Number(trimmed)
  return price > 0 ? price : null
}

export const PAYMENT_MODES: AncillaryPaymentMode[] = ['CASH', 'UPI', 'CARD', 'FLEET_CARD', 'CREDIT']

export const UNITS: UnitOfMeasure[] = ['LITRE', 'KG', 'PIECE']

export type PackUnit = 'litre' | 'millilitre' | 'kg' | 'gram' | 'piece'

/** A pack below one litre or one kilo reads better in ml or g: 0.5 L is "500 ml". */
export function packSize(packageSize: number, unit: UnitOfMeasure): { amount: number; unit: PackUnit } {
  const size = Number(packageSize)
  if (unit === 'PIECE') return { amount: size, unit: 'piece' }
  const isSmall = size > 0 && size < 1
  if (unit === 'KG') return isSmall ? { amount: Math.round(size * 1000), unit: 'gram' } : { amount: size, unit: 'kg' }
  return isSmall ? { amount: Math.round(size * 1000), unit: 'millilitre' } : { amount: size, unit: 'litre' }
}

const PAYMENT_MODE_BADGE: Record<AncillaryPaymentMode, Omit<StatusBadgeSpec, 'label'>> = {
  CASH: { tone: 'ok', icon: Banknote },
  UPI: { tone: 'info', icon: Smartphone },
  CARD: { tone: 'info', icon: CreditCard },
  FLEET_CARD: { tone: 'neutral', icon: Truck },
  CREDIT: { tone: 'warn', icon: HandCoins },
}

export function paymentModeBadge(mode: AncillaryPaymentMode): StatusBadgeSpec {
  return { ...(PAYMENT_MODE_BADGE[mode] ?? { tone: 'neutral', icon: CircleDot }), label: codeLabel(mode) }
}
