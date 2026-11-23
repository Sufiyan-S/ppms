import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Printer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../../api/shiftApi'
import { MoneyText } from '../../../components/AmountText'
import { SkeletonRows } from '../../../components/Skeleton'
import { StatusBadge } from '../../../components/StatusBadge'
import { shiftStatusBadge } from '../../../components/statusBadges'
import { codeLabel } from '../../../constants/labels'
import { useAuthStore } from '../../../store/authStore'
import { parseApiError } from '../../../utils/apiError'
import { formatIstDateTime } from '../../../utils/date'
import { DiscrepancyBadge } from '../components/DiscrepancyBadge'
import { HandoverReportPanel } from '../modals/HandoverReportPanel'
import { ResolveDiscrepancyModal } from '../modals/ResolveDiscrepancyModal'
import { awaitingOwnerApprovalLabel, discrepancyAction, investigationLabel } from '../shiftLabels'

const TIME = { hour: '2-digit', minute: '2-digit' } as const

/** The detail half of shift history: who, when, what was collected, any discrepancy, credit sales and the actions on it. */
export function ShiftDetail({ pumpId, shiftId }: { pumpId: number; shiftId: number }) {
  const { t } = useTranslation(['shifts', 'common'])
  const role = useAuthStore((state) => state.user?.role)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const { data: shift, isLoading, error } = useQuery({
    queryKey: ['shift', pumpId, shiftId],
    queryFn: () => shiftApi.getShift(pumpId, shiftId),
  })

  if (isLoading) return <SkeletonRows count={4} />
  if (error || !shift) {
    return <p role="alert" className="ui-alert ui-alert-error text-sm">{parseApiError(error, t('history.shiftNotFound', { id: shiftId }))}</p>
  }

  const resolveAction = discrepancyAction(shift, role)
  const investigation = investigationLabel(shift)
  const facts = [
    { label: t('handover.report.operator'), value: shift.operatorName },
    { label: t('handover.report.date'), value: shift.shiftDate },
    { label: t('handover.report.du'), value: shift.duName ?? t('handover.report.duFallback', { number: shift.duNumber }) },
    { label: t('handover.report.shiftWindow'), value: shift.shiftWindow ?? '—' },
    { label: t('detail.nozzles'), value: shift.nozzles.map((n) => `#${n.nozzleNumber} ${codeLabel(n.fuelType)}`).join(', ') },
    {
      label: t('detail.time'),
      value: `${formatIstDateTime(shift.actualStartTime, TIME)} → ${shift.actualEndTime ? formatIstDateTime(shift.actualEndTime, TIME) : t('handover.report.stillOpen')}`,
    },
  ]
  const collections = [
    { label: t('common:paymentMethods.CASH'), value: shift.cashCollected },
    { label: t('common:paymentMethods.UPI'), value: shift.upiCollected },
    { label: t('common:paymentMethods.CARD'), value: shift.cardCollected },
    { label: t('common:paymentMethods.FLEET_CARD'), value: shift.fleetCardCollected },
    { label: t('common:paymentMethods.CREDIT'), value: shift.creditTotal },
  ]

  return (
    <article className="space-y-5 text-sm" aria-labelledby={`shift-detail-${shift.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={`shift-detail-${shift.id}`} className="ui-title-sm">{t('common:shiftNumber', { id: shift.id })}</h3>
        <div className="flex flex-wrap items-center gap-1">
          <StatusBadge {...shiftStatusBadge(shift.status)} />
          {shift.isBackfilled && <StatusBadge tone="neutral" icon={History} label={t('history.backfilled')} />}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {facts.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="m-0 font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby={`shift-collections-${shift.id}`}>
        <h4 id={`shift-collections-${shift.id}`} className="mb-2 text-xs font-semibold text-ink-3">{t('handover.report.collections')}</h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {collections.map(({ label, value }) => (
            <div key={label} className="flex justify-between rounded-control bg-surface-sunken px-3 py-2">
              <span className="text-ink-3">{label}</span>
              <MoneyText value={value} className="font-semibold text-ink" />
            </div>
          ))}
          <div className="flex justify-between rounded-control bg-surface-sunken px-3 py-2 sm:col-span-2">
            <span className="font-semibold text-ink">{t('handover.report.totalDue')}</span>
            <MoneyText value={shift.totalAmountDue} className="font-bold text-ink" />
          </div>
        </div>
      </section>

      {shift.discrepancyAmount != null && (
        <section aria-labelledby={`shift-discrepancy-${shift.id}`} className="space-y-1">
          <h4 id={`shift-discrepancy-${shift.id}`} className="text-xs font-semibold text-ink-3">{t('handover.report.discrepancy')}</h4>
          <DiscrepancyBadge type={shift.discrepancyType} amount={shift.discrepancyAmount} />
          {shift.discrepancyReason && <p className="text-ink-2">{t('handover.report.reason', { reason: shift.discrepancyReason })}</p>}
          {shift.discrepancyResolution && <p className="text-ink-3">{codeLabel(shift.discrepancyResolution)}</p>}
          {investigation && <p className="text-warn">{investigation}</p>}
          {resolveAction === 'awaiting-owner' && <p className="font-medium text-warn">{awaitingOwnerApprovalLabel()}</p>}
        </section>
      )}

      {shift.creditEntries.length > 0 && (
        <section aria-labelledby={`shift-credit-${shift.id}`}>
          <h4 id={`shift-credit-${shift.id}`} className="mb-2 text-xs font-semibold text-ink-3">{t('creditEntries.title')}</h4>
          <ul className="divide-y divide-border rounded-card border border-border">
            {shift.creditEntries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{entry.clientName}</span>
                  <span className="text-xs text-ink-3">{entry.billNo ? `${t('creditEntries.bill')} ${entry.billNo}` : t('creditEntries.noBill')}</span>
                </span>
                <MoneyText value={entry.amount} className="shrink-0 font-semibold text-warn" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {resolveAction === 'resolve' && (
          <button type="button" onClick={() => setResolveOpen(true)} className="ui-btn ui-btn-danger">{t('history.resolve')}</button>
        )}
        {resolveAction === 'approve' && (
          <button type="button" onClick={() => setResolveOpen(true)} className="ui-btn ui-btn-warning">{t('common:actions.approve')}</button>
        )}
        {shift.totalAmountDue != null && (
          <button type="button" onClick={() => setReportOpen(true)} className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5">
            <Printer size={14} strokeWidth={2} aria-hidden="true" />
            {t('history.printHandover')}
          </button>
        )}
      </div>

      {resolveOpen && <ResolveDiscrepancyModal shift={shift} onClose={() => setResolveOpen(false)} />}
      {reportOpen && <HandoverReportPanel shift={shift} onClose={() => setReportOpen(false)} />}
    </article>
  )
}
