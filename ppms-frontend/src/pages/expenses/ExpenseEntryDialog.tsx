import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { expenseApi } from '../../api/expenseApi'
import type { ExpenseCategory, CreateExpenseRequest } from '../../api/expenseApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { useToastStore } from '../../store/toastStore'
import { Modal } from '../../components/Modal'
import { parseApiError } from '../../utils/apiError'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { NumericInput } from '../../components/NumericInput'
import { FormField } from '../../components/FormField'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { CATEGORIES, fmtDate } from './expenseFormat'
import { codeLabel } from '../../constants/labels'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'

interface ExpenseEntryDialogProps {
  pumpId: number
  onClose: () => void
}

interface FieldErrors {
  amount?: string
  description?: string
}

/** Records an expense: the entry form, then a review step before saving. */
export function ExpenseEntryDialog({ pumpId, onClose }: ExpenseEntryDialogProps) {
  const { t } = useTranslation(['expenses', 'common'])
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const stillNeededId = useId()
  const categoryLabelId = useId()
  const [form, setForm] = useState<CreateExpenseRequest>({
    category: 'MAINTENANCE',
    amount: 0,
    description: '',
    expenseDate: localDateInputValue(),
    saveDraft: false,
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const createMutation = useMutation({
    mutationFn: (data: CreateExpenseRequest) => expenseApi.createExpense(pumpId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses', pumpId] })
      addToast(t('form.recorded'), 'success')
      onClose()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('form.recordFailed'))
      setServerError(msg)
      addToast(msg, 'error')
    },
  })

  const validateForm = () => {
    const errors: FieldErrors = {}
    if (!form.description.trim()) errors.description = t('form.descriptionRequired')
    if (form.amount <= 0) errors.amount = t('form.amountPositive')
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (validateForm()) setReviewing(true)
  }

  if (reviewing) {
    return (
      <Modal
        tone="info"
        title={t('review.title')}
        subtitle={`${codeLabel(form.category)} · ${fmtDate(form.expenseDate)}`}
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
            {t('review.add')}
          </LoadingButton>
        </>}
      >
        {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
        <dl className="ui-card-plain ui-card-muted divide-y divide-border overflow-hidden text-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-ink-2">{t('form.category')}</dt>
            <dd><StatusBadge tone="neutral" label={codeLabel(form.category)} /></dd>
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
            <dt className="text-ink-2">{t('form.expenseDate')}</dt>
            <dd className="font-medium text-ink">{fmtDate(form.expenseDate)}</dd>
          </div>
          {form.saveDraft && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt className="text-ink-2">{t('review.savedAs')}</dt>
              <dd><StatusBadge tone="neutral" label={t('list.statusDraft')} /></dd>
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
          <span id={categoryLabelId} className="ui-label">{t('form.category')}</span>
          <SearchableSelect
            value={form.category}
            onChange={v => setForm(f => ({ ...f, category: v as ExpenseCategory }))}
            options={CATEGORIES.map(c => ({ value: c, label: codeLabel(c) }))}
            aria-labelledby={categoryLabelId}
          />
        </div>

        <FormField label={t('form.amount')} error={fieldErrors.amount}>
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

        <FormField label={t('form.expenseDate')}>
          <input
            type="date"
            value={form.expenseDate}
            onChange={e => setForm(f => ({ ...f, expenseDate: e.target.value }))}
            required
          />
        </FormField>

        <FormGridFullRow>
          <label className="ui-inline-check">
            <input
              type="checkbox"
              checked={!!form.saveDraft}
              onChange={e => setForm(f => ({ ...f, saveDraft: e.target.checked }))}
            />
            <span>{t('form.saveDraft')}</span>
          </label>
        </FormGridFullRow>
      </FormGrid>

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
