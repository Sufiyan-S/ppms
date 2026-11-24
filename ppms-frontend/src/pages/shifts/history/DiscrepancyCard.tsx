import { useTranslation } from 'react-i18next'
import type { Shift } from '../../../types/shift'
import type { UserRole } from '../../../types/auth'
import { awaitingOwnerApprovalLabel, discrepancyAction, investigationLabel, resolutionLabel } from '../shiftLabels'
import { StatusBadge } from '../../../components/StatusBadge'
import type { StatusTone } from '../../../components/StatusBadge'
import { shiftStatusBadge } from '../../../components/statusBadges'
import { MoneyText } from '../../../components/AmountText'
import { DiscrepancyBadge } from '../components/DiscrepancyBadge'

const RESOLUTION_TONE: Record<string, StatusTone> = {
  CASH_RECOVERY:    'ok',
  SALARY_DEDUCTION: 'info',
  WAIVED:           'neutral',
}

export function DiscrepancyStatus({ shift }: { shift: Shift }) {
  const investigation = investigationLabel(shift)
  return (
    <>
      {shift.discrepancyResolution ? (
        <StatusBadge
          tone={RESOLUTION_TONE[shift.discrepancyResolution] ?? 'warn'}
          label={resolutionLabel(shift.discrepancyResolution)}
        />
      ) : (
        <StatusBadge {...shiftStatusBadge(shift.status)} />
      )}
      {investigation && (
        <span className="block text-xs text-warn font-medium mt-1">{investigation}</span>
      )}
    </>
  )
}

export function DiscrepancyAction({ shift, role, onOpen, className = '' }: {
  shift: Shift; role: UserRole | undefined; onOpen: (shift: Shift) => void; className?: string
}) {
  const { t } = useTranslation(['shifts', 'common'])
  const action = discrepancyAction(shift, role)
  if (action === 'resolve') {
    return (
      <button type="button" onClick={() => onOpen(shift)}
        aria-label={t('history.discrepancies.resolveLabel', { id: shift.id })}
        className={`ui-btn ui-btn-primary ${className}`}>
        {t('history.resolve')}
      </button>
    )
  }
  if (action === 'approve') {
    return (
      <button type="button" onClick={() => onOpen(shift)}
        aria-label={t('history.discrepancies.approveLabel', { id: shift.id })}
        className={`ui-btn ui-btn-primary ${className}`}>
        {t('common:actions.approve')}
      </button>
    )
  }
  if (action === 'awaiting-owner') {
    return <span className="text-xs text-warn font-medium">{awaitingOwnerApprovalLabel()}</span>
  }
  return null
}

/** One discrepancy on a phone, with its action as a full-width button. */
export function DiscrepancyCard({ shift, role, onOpen }: { shift: Shift; role: UserRole | undefined; onOpen: (shift: Shift) => void }) {
  const { t } = useTranslation(['shifts', 'common'])
  const note = shift.discrepancyResolutionNote ?? shift.investigationNote ?? shift.discrepancyReason
  return (
    <li data-testid="discrepancy-card" className="space-y-2 bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{shift.operatorName}</p>
          <p className="text-xs text-ink-3">{shift.shiftDate} · {shift.shiftWindow}</p>
        </div>
        <DiscrepancyBadge type={shift.discrepancyType} amount={shift.discrepancyAmount ?? 0} />
      </div>
      <div><DiscrepancyStatus shift={shift} /></div>
      {shift.cashRecoveryAmount != null && shift.cashRecoveryAmount > 0 && (
        <p className="text-xs text-ok">{t('history.discrepancies.recovered')} <MoneyText value={shift.cashRecoveryAmount} /></p>
      )}
      {note && <p className="text-xs text-ink-2">{note}</p>}
      <DiscrepancyAction shift={shift} role={role} onOpen={onOpen} className="w-full" />
    </li>
  )
}
