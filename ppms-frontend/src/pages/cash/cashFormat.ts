import { ArrowDown, ArrowUp, Lock, Wallet } from 'lucide-react'
import type { CashEventType } from '../../api/cashApi'
import type { StatusBadgeSpec } from '../../components/statusBadges'

/** Labels are cash.json eventTypes.<value>. */
export const EVENT_TYPES: CashEventType[] = ['OPENING_BALANCE', 'CASH_IN', 'CASH_OUT', 'CLOSING_BALANCE']

export const EVENT_BADGES: Record<CashEventType, Omit<StatusBadgeSpec, 'label'>> = {
  OPENING_BALANCE: { tone: 'info', icon: Wallet },
  CASH_IN:         { tone: 'ok', icon: ArrowDown },
  CASH_OUT:        { tone: 'bad', icon: ArrowUp },
  CLOSING_BALANCE: { tone: 'neutral', icon: Lock },
}

export { formatCurrency as fmtAmt } from '../../utils/format'

export { formatIstDate as fmtDate } from '../../utils/date'

/** The safe's balance once this movement is saved; null for the balance events, which do not move money. */
export function balanceAfter(eventType: CashEventType, balance: number, amount: number): number | null {
  if (eventType === 'CASH_IN') return balance + amount
  if (eventType === 'CASH_OUT') return balance - amount
  return null
}
