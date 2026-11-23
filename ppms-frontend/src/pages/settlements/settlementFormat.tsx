import { Smartphone, CreditCard, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SettlementPaymentType } from '../../api/paymentSettlementApi'
import { translateKey } from '../../i18n'

// ── Constants ──────────────────────────────────────────────────────────────

export const TYPES: SettlementPaymentType[] = ['UPI', 'CARD', 'FLEET_CARD']

export function typeLabel(type: SettlementPaymentType): string {
  return translateKey(`common:paymentMethods.${type}`)
}

export const TYPE_ICONS: Record<SettlementPaymentType, ReactNode> = {
  UPI:        <Smartphone size={16} strokeWidth={2} />,
  CARD:       <CreditCard size={16} strokeWidth={2} />,
  FLEET_CARD: <Truck size={16} strokeWidth={2} />,
}

export const TYPE_ACCENT: Record<SettlementPaymentType, { icon: string; badge: string }> = {
  UPI:        { icon: 'bg-info',    badge: 'bg-info-bg text-info' },
  CARD:       { icon: 'bg-primary', badge: 'bg-surface-sunken text-primary' },
  FLEET_CARD: { icon: 'bg-neutral', badge: 'bg-neutral-bg text-neutral' },
}

// ── Helpers ────────────────────────────────────────────────────────────────

export { formatCurrency as fmtAmt } from '../../utils/format'

export { formatIstDate as fmtDate } from '../../utils/date'

export function getPending(wallet: { upiPending: number; cardPending: number; fleetCardPending: number } | undefined, type: SettlementPaymentType): number {
  if (!wallet) return 0
  return type === 'UPI' ? wallet.upiPending : type === 'CARD' ? wallet.cardPending : wallet.fleetCardPending
}
