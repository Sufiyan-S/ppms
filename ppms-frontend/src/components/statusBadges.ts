import { AlertTriangle, ArrowDown, ArrowUp, Ban, Check, CircleDot, Clock, FileCheck, Gauge, Hourglass, Pause, Percent, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DiscrepancyType, ShiftStatus } from '../types/shift'
import type { CreditInvoiceStatus, CreditStanding, CreditTransaction } from '../api/creditApi'
import type { ExpenseApprovalStatus } from '../api/expenseApi'
import { codeLabel } from '../constants/labels'
import i18n from '../i18n'
import { statusLabel } from '../pages/shifts/shiftLabels'
import type { StatusTone } from './StatusBadge'

export interface StatusBadgeSpec {
  tone: StatusTone
  icon: LucideIcon
  label: string
}

const SHIFT_STATUS: Record<ShiftStatus, Omit<StatusBadgeSpec, 'label'>> = {
  OPEN: { tone: 'ok', icon: CircleDot },
  OPEN_OVERDUE: { tone: 'warn', icon: Clock },
  AUTO_CLOSED_OVERDUE: { tone: 'bad', icon: AlertTriangle },
  CLOSED_BALANCED: { tone: 'neutral', icon: Check },
  CLOSED_DISCREPANCY_PENDING: { tone: 'bad', icon: AlertTriangle },
  CLOSED_DISCREPANCY_PENDING_APPROVAL: { tone: 'warn', icon: Hourglass },
  CLOSED_DISCREPANCY_RESOLVED: { tone: 'neutral', icon: Check },
}

export function shiftStatusBadge(status: ShiftStatus): StatusBadgeSpec {
  const look = SHIFT_STATUS[status] ?? { tone: 'neutral', icon: CircleDot }
  return { ...look, label: statusLabel(status) }
}

/** SHORT is money missing (bad), OVER is money extra (warn); null means the shift balanced. */
export function discrepancyBadge(type: DiscrepancyType | null): StatusBadgeSpec {
  if (type === 'SHORT') return { tone: 'bad', icon: ArrowDown, label: i18n.t('badges.short') }
  if (type === 'OVER') return { tone: 'warn', icon: ArrowUp, label: i18n.t('badges.over') }
  return { tone: 'ok', icon: Check, label: i18n.t('badges.balanced') }
}

const APPROVAL_STATUS: Record<ExpenseApprovalStatus, Omit<StatusBadgeSpec, 'label'>> = {
  DRAFT: { tone: 'neutral', icon: Pause },
  PENDING_APPROVAL: { tone: 'warn', icon: Hourglass },
  APPROVED: { tone: 'ok', icon: Check },
  REJECTED: { tone: 'bad', icon: X },
}

export function approvalStatusBadge(status: ExpenseApprovalStatus): StatusBadgeSpec {
  return { ...APPROVAL_STATUS[status], label: codeLabel(status) }
}

export function invoiceStatusBadge(status: CreditInvoiceStatus): StatusBadgeSpec {
  return status === 'CANCELLED'
    ? { tone: 'bad', icon: Ban, label: codeLabel(status) }
    : { tone: 'ok', icon: FileCheck, label: codeLabel(status) }
}

const CREDIT_STANDING: Record<CreditStanding, Omit<StatusBadgeSpec, 'label'>> = {
  OK: { tone: 'ok', icon: Check },
  OVERDUE: { tone: 'bad', icon: Clock },
  OVER_LIMIT: { tone: 'warn', icon: Gauge },
  INACTIVE: { tone: 'neutral', icon: Pause },
}

export function creditStandingBadge(standing: CreditStanding): StatusBadgeSpec {
  return { ...CREDIT_STANDING[standing], label: codeLabel(standing) }
}

export function settlementOverdueBadge(): StatusBadgeSpec {
  return { tone: 'bad', icon: Clock, label: i18n.t('common:badges.overdue') }
}

/** A ledger row's status wins over its type, so a voided sale reads "Voided" rather than "Sale". */
export function creditTransactionBadge(tx: Pick<CreditTransaction, 'type' | 'status'>): StatusBadgeSpec {
  if (tx.status === 'PENDING_APPROVAL') return { label: i18n.t('badges.pendingApproval'), tone: 'warn', icon: Hourglass }
  if (tx.status === 'REJECTED') return { label: i18n.t('badges.rejected'), tone: 'neutral', icon: X }
  if (tx.status === 'VOIDED') return { label: i18n.t('badges.voided'), tone: 'neutral', icon: Ban }
  if (tx.status === 'WAIVED') return { label: i18n.t('badges.waived'), tone: 'neutral', icon: Ban }
  if (tx.type === 'SALE') return { label: i18n.t('badges.sale'), tone: 'warn', icon: ArrowUp }
  if (tx.type === 'COUNTER_SALE') return { label: i18n.t('badges.shopSale'), tone: 'warn', icon: ArrowUp }
  if (tx.type === 'INTEREST') return { label: i18n.t('badges.interest'), tone: 'info', icon: Percent }
  return { label: i18n.t('badges.paid'), tone: 'ok', icon: ArrowDown }
}
