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

export const PAYMENT_MODES: AncillaryPaymentMode[] = ['CASH', 'UPI', 'CARD', 'FLEET_CARD', 'CREDIT']

export const UNITS: UnitOfMeasure[] = ['LITRE', 'KG', 'PIECE']

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
