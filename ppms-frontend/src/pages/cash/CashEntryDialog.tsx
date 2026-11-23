import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cashApi } from '../../api/cashApi'
import type { CashEventType, RecordCashEventRequest } from '../../api/cashApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { NumericInput } from '../../components/NumericInput'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { FormField } from '../../components/FormField'
import { FormGrid } from '../../components/layout/FormGrid'
import { LiveFigures } from '../../components/LiveFigures'
import type { LiveFigure } from '../../components/LiveFigures'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { parseApiError } from '../../utils/apiError'
import { EVENT_BADGES, EVENT_TYPES, balanceAfter, fmtAmt, fmtDate } from './cashFormat'

interface CashEntryDialogProps {
  pumpId: number
  balance: number
  onClose: () => void
}

interface FieldErrors {
  amount?: string
  description?: string
}

/** Records money entering or leaving the safe: the entry form, then a review step before saving. */
export function CashEntryDialog({ pumpId, balance, onClose }: CashEntryDialogProps) {
  const { t } = useTranslation(['cash', 'common'])
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const stillNeededId = useId()
  const [form, setForm] = useState<RecordCashEventRequest>({
    eventType: 'CASH_IN',
    amount: 0,
    description: '',
    eventDate: localDateInputValue(),
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const createMutation = useMutation({
    mutationFn: (data: RecordCashEventRequest) => cashApi.recordCashEvent(pumpId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashEvents', pumpId] })
      addToast(t('form.recorded'), 'success')
      onClose()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('form.recordFailed'))
      setServerError(msg)
      addToast(msg, 'error')
    },
  })

  const exceedsBalance = form.eventType === 'CASH_OUT' && form.amount > balance

  const validateForm = () => {
    const errors: FieldErrors = {}
    if (!form.description.trim()) errors.description = t('form.descriptionRequired')
    if (form.amount <= 0) errors.amount = t('form.amountPositive')
    else if (exceedsBalance) errors.amount = t('form.exceedsBalance', { amount: fmtAmt(form.amount), balance: fmtAmt(balance) })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (validateForm()) setReviewing(true)
  }

  const after = balanceAfter(form.eventType, balance, form.amount)
  const figures: LiveFigure[] = after === null ? [] : [
    { label: t('form.balanceNow'), value: <MoneyText value={balance} /> },
    { label: t('form.balanceAfter'), value: <MoneyText value={form.amount > 0 ? after : null} tone={after < 0 ? 'bad' : undefined} />, isResult: true },
  ]

  if (reviewing) {
    return (
      <Modal
        tone="info"
        title={t('review.title')}
        subtitle={`${t(`eventTypes.${form.eventType}`)} · ${fmtDate(form.eventDate)}`}
        size="md-wide"
        onClose={onClose}
        canClose={!createMutation.isPending}
        bodyClassName="space-y-4"
        footer={<>
          <button type="button" onClick={() => setReviewing(false)} disabled={createMutation.isPending} className="ui-btn ui-btn-secondary">
            {t('common:actions.edit')}
          </button>
          <LoadingButton
            type="button"
            isLoading={createMutation.isPending}
            loadingLabel={t('common:actions.saving')}
            onClick={() => { if (validateForm()) createMutation.mutate(form) }}
            className="ui-btn-primary"
          >
            {t('review.record')}
          </LoadingButton>
        </>}
      >
        {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
        <dl className="ui-card-plain ui-card-muted divide-y divide-border overflow-hidden text-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-ink-2">{t('form.eventType')}</dt>
            <dd><StatusBadge {...EVENT_BADGES[form.eventType]} label={t(`eventTypes.${form.eventType}`)} /></dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-ink-2">{t('form.amount')}</dt>
            <dd><MoneyText value={form.amount} className="font-semibold text-ink" /></dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-ink-2">{t('form.description')}</dt>
            <dd className="text-right font-medium text-ink break-words">{form.description.trim()}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-ink-2">{t('form.date')}</dt>
            <dd className="font-medium text-ink">{fmtDate(form.eventDate)}</dd>
          </div>
          {after !== null && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt className="text-ink-2">{t('form.balanceAfter')}</dt>
              <dd><MoneyText value={after} className="font-semibold text-ink" /></dd>
            </div>
          )}
        </dl>
      </Modal>
    )
  }

  const stillNeeded = [
    ...(form.amount > 0 ? [] : [t('form.needAmount')]),
    ...(form.description.trim() ? [] : [t('form.needDescription')]),
  ]

  return (
    <Modal
      tone="info"
      title={t('form.title')}
      subtitle={t('form.subtitle')}
      size="lg"
      onClose={onClose}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={<>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <button type="submit" disabled={stillNeeded.length > 0}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          className="ui-btn ui-btn-primary">
          {t('common:actions.review')}
        </button>
      </>}
    >
      <FormGrid>
        <div>
          <span className="ui-label">{t('form.eventType')}</span>
          <SearchableSelect label={t('form.eventType')}
            value={form.eventType}
            onChange={v => setForm(f => ({ ...f, eventType: v as CashEventType }))}
            options={EVENT_TYPES.map(type => ({ value: type, label: t(`eventTypes.${type}`) }))}
          />
        </div>

        <FormField
          label={t('form.amount')}
          error={fieldErrors.amount ?? (exceedsBalance ? t('form.availableBalance', { amount: fmtAmt(balance) }) : undefined)}
          help={form.eventType === 'CASH_OUT' && !exceedsBalance && !fieldErrors.amount
            ? t('form.availableBalance', { amount: fmtAmt(balance) })
            : undefined}
        >
          <NumericInput
            unit="₹"
            min="0"
            step="0.01"
            value={form.amount || ''}
            onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
            data-autofocus
            required
          />
        </FormField>

        <FormField label={t('form.description')} error={fieldErrors.description}>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            required
          />
        </FormField>

        <FormField label={t('form.date')}>
          <input
            type="date"
            value={form.eventDate}
            onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))}
            required
          />
        </FormField>
      </FormGrid>

      {figures.length > 0 && <LiveFigures label={t('form.balanceAfter')} figures={figures} />}

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
