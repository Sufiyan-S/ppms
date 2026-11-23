import { formatIstDate, formatIstDateTime, localDateInputValue } from '../../utils/date'
import type { Shift, ShiftStatus } from '../../types/shift'
import type { UserRole } from '../../types/auth'
import { canPerformAction } from '../../permissions/permissions'
import i18n from '../../i18n'

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL_KEYS = {
  OPEN:                                'labels.status.open',
  OPEN_OVERDUE:                        'labels.status.overdue',
  AUTO_CLOSED_OVERDUE:                 'labels.status.autoClosed',
  CLOSED_BALANCED:                     'labels.status.balanced',
  CLOSED_DISCREPANCY_PENDING:          'labels.status.discrepancy',
  CLOSED_DISCREPANCY_PENDING_APPROVAL: 'labels.status.needsApproval',
  CLOSED_DISCREPANCY_RESOLVED:         'labels.status.resolved',
} as const satisfies Record<ShiftStatus, string>

export function statusLabel(status: ShiftStatus): string {
  const key = STATUS_LABEL_KEYS[status]
  return key ? i18n.t(key, { ns: 'shifts' }) : status
}

export function awaitingOwnerApprovalLabel(): string {
  return i18n.t('labels.awaitingOwnerApproval', { ns: 'shifts' })
}

/**
 * What the signed-in user can do about an unresolved discrepancy: a shortage escalated for approval
 * is only for OWNER/ADMIN, everything else pending is for whoever may resolve discrepancies.
 */
export function discrepancyAction(shift: Shift, role: UserRole | undefined): 'resolve' | 'approve' | 'awaiting-owner' | null {
  if (shift.status === 'CLOSED_DISCREPANCY_PENDING_APPROVAL') {
    return role === 'OWNER' || role === 'ADMIN' ? 'approve' : 'awaiting-owner'
  }
  if (shift.status === 'CLOSED_DISCREPANCY_PENDING' && canPerformAction('shift:resolve-discrepancy', role)) {
    return 'resolve'
  }
  return null
}

export const PAGE_SIZE = 10

// ── Date helpers ─────────────────────────────────────────────────────────────


export function labelForDate(d: string): string {
  const todayStr     = localDateInputValue()
  const yesterdayStr = localDateInputValue(-1)
  const dayBeforeStr = localDateInputValue(-2)
  if (d === todayStr)     return i18n.t('common:datePresets.today')
  if (d === yesterdayStr) return i18n.t('common:datePresets.yesterday')
  if (d === dayBeforeStr) return i18n.t('labels.dayBeforeYesterday', { ns: 'shifts' })
  return formatIstDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export { formatCurrencyOrDash as fmtAmt } from '../../utils/format'

// ── Discrepancies History ─────────────────────────────────────────────────────

const RESOLUTION_LABEL_KEYS = {
  PENDING_INVESTIGATION: 'labels.resolution.pendingInvestigation',
  SALARY_DEDUCTION:      'labels.resolution.salaryDeduction',
  CASH_RECOVERY:         'labels.resolution.cashRecovery',
  WAIVED:                'labels.resolution.waived',
} as const

type ResolutionCode = keyof typeof RESOLUTION_LABEL_KEYS

function isResolutionCode(code: string): code is ResolutionCode {
  return code in RESOLUTION_LABEL_KEYS
}

/** The resolution's label, or the code itself when it is not a known resolution. */
export function resolutionLabel(code: string): string {
  return isResolutionCode(code) ? i18n.t(RESOLUTION_LABEL_KEYS[code], { ns: 'shifts' }) : code
}

/** "Under investigation by … since …" while a pending discrepancy is being investigated, otherwise null. */
export function investigationLabel(shift: Shift): string | null {
  const isPending = shift.status === 'CLOSED_DISCREPANCY_PENDING' || shift.status === 'CLOSED_DISCREPANCY_PENDING_APPROVAL'
  if (!isPending || !shift.investigationStartedAt) return null
  return i18n.t('labels.underInvestigation', {
    ns: 'shifts',
    name: shift.investigatedByName ?? i18n.t('labels.unknownUser', { ns: 'shifts' }),
    since: formatIstDateTime(shift.investigationStartedAt),
  })
}

// ── Resolve Discrepancy Modal ─────────────────────────────────────────────────

export function resolutionChoices(): { value: ResolutionCode; label: string }[] {
  return (Object.keys(RESOLUTION_LABEL_KEYS) as ResolutionCode[]).map((value) => ({ value, label: resolutionLabel(value) }))
}
