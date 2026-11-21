import { Smartphone, CreditCard, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SettlementPaymentType } from '../../api/paymentSettlementApi'

// ── Constants ──────────────────────────────────────────────────────────────

export const TYPES: SettlementPaymentType[] = ['UPI', 'CARD', 'FLEET_CARD']

export const TYPE_LABELS: Record<SettlementPaymentType, string> = {
  UPI:        'UPI',
  CARD:       'Card',
  FLEET_CARD: 'Fleet Card',
}

export const TYPE_ICONS: Record<SettlementPaymentType, ReactNode> = {
  UPI:        <Smartphone size={16} strokeWidth={2} />,
  CARD:       <CreditCard size={16} strokeWidth={2} />,
  FLEET_CARD: <Truck size={16} strokeWidth={2} />,
}

export const TYPE_ACCENT: Record<SettlementPaymentType, { icon: string; badge: string; pill: string; pillActive: string }> = {
  UPI:        { icon: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700', pill: 'border-violet-200 text-violet-700 hover:bg-violet-50', pillActive: 'bg-violet-600 text-white border-violet-600' },
  CARD:       { icon: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700',     pill: 'border-blue-200 text-blue-700 hover:bg-blue-50',     pillActive: 'bg-blue-600 text-white border-blue-600'   },
  FLEET_CARD: { icon: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-700',     pill: 'border-teal-200 text-teal-700 hover:bg-teal-50',     pillActive: 'bg-teal-600 text-white border-teal-600'   },
}

// ── Helpers ────────────────────────────────────────────────────────────────

export { formatCurrency as fmtAmt } from '../../utils/format'

export { formatIstDate as fmtDate } from '../../utils/date'

export function getPending(wallet: { upiPending: number; cardPending: number; fleetCardPending: number } | undefined, type: SettlementPaymentType): number {
  if (!wallet) return 0
  return type === 'UPI' ? wallet.upiPending : type === 'CARD' ? wallet.cardPending : wallet.fleetCardPending
}
