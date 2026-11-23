import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck } from 'lucide-react'
import { withToggled } from '../../utils/setToggle'
import { useQuery } from '@tanstack/react-query'
import type { StaffMember } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { GeneratePayrollRequest, PendingDiscrepancy } from '../../api/payrollApi'
import { Modal } from '../../components/Modal'
import { LoadingButton } from '../../components/LoadingButton'
import { StatusBadge } from '../../components/StatusBadge'
import { discrepancyBadge } from '../../components/statusBadges'
import { MoneyText } from '../../components/AmountText'
import { LiveFigures } from '../../components/LiveFigures'
import { fmtDate } from './payrollFormat'
import { roleLabel } from '../../constants/labels'

interface ReviewModalProps {
  form: GeneratePayrollRequest
  selectedStaff: StaffMember | undefined
  pumpId: number
  formError: string | null
  isPending: boolean
  onClose: () => void
  onGenerate: (deductIds: number[]) => void
}

export function ReviewModal({ form, selectedStaff, pumpId, formError, isPending, onClose, onGenerate }: ReviewModalProps) {
  const { t } = useTranslation(['payroll', 'common'])
  const [deductSet, setDeductSet] = useState<Set<number>>(new Set())
  const pendingTitleId = useId()

  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-discrepancies', pumpId, form.userId],
    queryFn: () => payrollApi.getPendingDiscrepancies(pumpId, form.userId),
    enabled: form.userId > 0,
  })

  const toggleDeduct = (id: number) =>
    setDeductSet(prev => withToggled(prev, id))

  const totalDeductAmt = pending
    .filter(d => deductSet.has(d.id))
    .reduce((s, d) => s + d.discrepancyAmount, 0)

  return (
    <Modal
      title={t('review.title')}
      subtitle={selectedStaff ? `${selectedStaff.fullName} · ${fmtDate(form.periodFrom)} – ${fmtDate(form.periodTo)}` : `${fmtDate(form.periodFrom)} – ${fmtDate(form.periodTo)}`}
      tone="info"
      size="lg"
      onClose={onClose}
      canClose={!isPending}
      fullScreenOnPhone
      bodyClassName="space-y-4"
      footerClassName="ui-modal-footer--large"
      footer={<>
        <button type="button" onClick={onClose} disabled={isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.edit')}
        </button>
        <LoadingButton type="button" onClick={() => onGenerate(Array.from(deductSet))} isLoading={isPending}
          loadingLabel={t('common:actions.generating')} className="ui-btn-primary">
          {t('review.generate')}
        </LoadingButton>
      </>}
    >
      {formError && (
        <p role="alert" className="ui-alert ui-alert-danger">{t('common:notices.goBackRetry', { error: formError })}</p>
      )}

      <dl className="ui-card-plain ui-card-muted divide-y divide-border overflow-hidden text-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-ink-3">{t('review.staffMember')}</dt>
          <dd className="text-right font-medium text-ink">{selectedStaff ? `${selectedStaff.fullName} — ${roleLabel(selectedStaff.role)}` : '—'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-ink-3">{t('review.period')}</dt>
          <dd className="text-right font-medium text-ink">{fmtDate(form.periodFrom)} – {fmtDate(form.periodTo)}</dd>
        </div>
        {form.notes?.trim() && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-ink-3">{t('common:fields.notes')}</dt>
            <dd className="text-right font-medium text-ink">{form.notes}</dd>
          </div>
        )}
      </dl>

      {pendingLoading ? (
        <p className="ui-help">{t('review.checking')}</p>
      ) : pending.length > 0 ? (
        <section aria-labelledby={pendingTitleId} className="space-y-2">
          <div>
            <h3 id={pendingTitleId} className="text-sm font-semibold text-ink">
              {t('review.pendingTitle', { count: pending.length })}
            </h3>
            <p className="ui-help mt-0.5">{t('review.toggleHint')}</p>
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border">
            {pending.map((d: PendingDiscrepancy) => (
              <li key={d.id} className="flex items-center gap-3 bg-surface px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink-3">#{d.id}</span>
                    <span className="text-xs text-ink-2">{fmtDate(d.shiftDate)}</span>
                    {(d.duName || d.duNumber != null) && (
                      <span className="text-xs text-ink-3">{d.duName ?? t('review.duNumber', { number: d.duNumber })}</span>
                    )}
                    <StatusBadge {...discrepancyBadge(d.discrepancyType)} />
                    <MoneyText value={d.discrepancyAmount} className="text-xs font-semibold text-ink" />
                  </div>
                  {d.discrepancyReason && (
                    <p className="mt-0.5 truncate text-xs text-ink-3">{d.discrepancyReason}</p>
                  )}
                </div>

                {/* An OVER discrepancy cannot be deducted from salary. */}
                {d.discrepancyType === 'SHORT' ? (
                  <label className="ui-inline-check shrink-0 text-sm">
                    <input type="checkbox" checked={deductSet.has(d.id)} onChange={() => toggleDeduct(d.id)}
                      aria-label={t('review.deductAria', { id: d.id })} />
                    <span aria-hidden="true">{t('review.deduct')}</span>
                  </label>
                ) : (
                  <span className="shrink-0 text-xs text-ink-3">{t('review.notDeductible')}</span>
                )}
              </li>
            ))}
          </ul>

          <LiveFigures
            label={t('review.deductionsLabel')}
            figures={[{
              label: deductSet.size > 0 ? t('review.deductionsSelected', { count: deductSet.size }) : t('review.deductionsLabel'),
              value: <MoneyText value={deductSet.size > 0 ? -totalDeductAmt : null} showSign className="font-semibold" />,
            }]}
          />
          {deductSet.size === 0 && <p className="ui-help">{t('review.allSkipped')}</p>}
        </section>
      ) : (
        <p className="flex items-center gap-2 text-sm text-ok">
          <CircleCheck size={16} aria-hidden="true" />
          {t('review.noDiscrepancies')}
        </p>
      )}
    </Modal>
  )
}
