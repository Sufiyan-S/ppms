import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { StaffMember } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { GeneratePayrollRequest } from '../../api/payrollApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Modal } from '../../components/Modal'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { StillNeeded } from '../../components/StillNeeded'
import { LiveFigures } from '../../components/LiveFigures'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { ReviewModal } from './ReviewModal'
import { fmtDate, periodDays, todayIso, yesterdayIso } from './payrollFormat'
import { codeLabel } from '../../constants/labels'

interface GeneratePayrollDialogProps {
  pumpId: number
  staff: StaffMember[]
  onGenerated: () => void
  onClose: () => void
}

/** Calculates a draft salary record: staff and period first, then the review step with shortfall deductions. */
export function GeneratePayrollDialog({ pumpId, staff, onGenerated, onClose }: GeneratePayrollDialogProps) {
  const { t } = useTranslation(['payroll', 'common'])
  const { addToast } = useToastStore()
  const qc = useQueryClient()
  const fieldId = useId()
  const [form, setForm] = useState<GeneratePayrollRequest>(() => ({
    userId: 0,
    periodFrom: yesterdayIso(),
    periodTo: todayIso(),
    notes: null,
  }))
  const [formError, setFormError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const generateMutation = useMutation({
    mutationFn: (data: GeneratePayrollRequest) => payrollApi.generatePayroll(pumpId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      onGenerated()
      addToast(t('generate.generated'), 'success')
      onClose()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('generate.failed'))
      setFormError(msg)
      addToast(msg, 'error')
    },
  })

  const stillNeeded = [
    ...(!form.userId ? [t('generate.stillNeeded.staff')] : []),
    ...(!form.periodFrom || !form.periodTo ? [t('generate.stillNeeded.period')] : []),
  ]
  const days = periodDays(form.periodFrom, form.periodTo)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.userId) { setFormError(t('generate.staffRequired')); return }
    if (!form.periodFrom || !form.periodTo) { setFormError(t('generate.periodRequired')); return }
    setFormError(null)
    setReviewing(true)
  }

  if (reviewing && form.userId > 0) {
    return (
      <ReviewModal
        form={form}
        selectedStaff={staff.find((s) => s.id === form.userId)}
        pumpId={pumpId}
        formError={formError}
        isPending={generateMutation.isPending}
        onClose={() => setReviewing(false)}
        onGenerate={(deductIds) => generateMutation.mutate({ ...form, deductFromSalaryShiftIds: deductIds })}
      />
    )
  }

  return (
    <Modal
      title={t('generate.title')}
      subtitle={staff.find((s) => s.id === form.userId)?.fullName ?? t('generate.subtitle')}
      tone="info"
      size="md-wide"
      onClose={onClose}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={<>
        <StillNeeded id={`${fieldId}-needed`} items={stillNeeded} />
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <button type="submit" disabled={stillNeeded.length > 0}
          aria-describedby={stillNeeded.length ? `${fieldId}-needed` : undefined}
          className="ui-btn ui-btn-primary">
          {t('generate.review')}
        </button>
      </>}
    >
      <FormGrid>
        <FormGridFullRow>
          <span id={`${fieldId}-staff`} className="ui-label">{t('generate.staffMember')}</span>
          <SearchableSelect aria-labelledby={`${fieldId}-staff`}
            value={form.userId ? form.userId.toString() : ''}
            onChange={v => setForm(f => ({ ...f, userId: parseInt(v) || 0 }))}
            placeholder={t('generate.selectStaff')}
            options={staff.map((s) => ({ value: s.id.toString(), label: `${s.fullName} — ${codeLabel(s.role)}` }))}
          />
        </FormGridFullRow>

        <div>
          <label htmlFor={`${fieldId}-from`} className="ui-label">{t('generate.periodFrom')}</label>
          <input id={`${fieldId}-from`} type="date" value={form.periodFrom} required
            onChange={e => setForm(f => ({ ...f, periodFrom: e.target.value }))} />
        </div>

        <div>
          <label htmlFor={`${fieldId}-to`} className="ui-label">{t('generate.periodTo')}</label>
          <input id={`${fieldId}-to`} type="date" value={form.periodTo} required
            onChange={e => setForm(f => ({ ...f, periodTo: e.target.value }))} />
        </div>

        <FormGridFullRow>
          <label htmlFor={`${fieldId}-notes`} className="ui-label">
            {t('common:fields.notes')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span>
          </label>
          <input id={`${fieldId}-notes`} type="text" value={form.notes ?? ''}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} />
        </FormGridFullRow>
      </FormGrid>

      <LiveFigures
        label={t('generate.payPeriod')}
        figures={[{
          label: t('generate.payPeriod'),
          value: days === null ? '—' : t('generate.periodDays', { count: days, from: fmtDate(form.periodFrom), to: fmtDate(form.periodTo) }),
        }]}
      />

      <p className="ui-help">{t('generate.howCalculated')}</p>

      {formError && <p role="alert" className="ui-error-text">{formError}</p>}
    </Modal>
  )
}
