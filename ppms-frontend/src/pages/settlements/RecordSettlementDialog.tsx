import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { PendingSettlementRange, RecordSettlementRequest, SettlementPaymentType, WalletSummary } from '../../api/paymentSettlementApi'
import { daysCoveredBy } from './settlementAging'
import { formatIstDate } from '../../utils/date'
import { Modal } from '../../components/Modal'
import { FormGrid, FormGridFullRow } from '../../components/layout/FormGrid'
import { FormField } from '../../components/FormField'
import { MoneyText } from '../../components/AmountText'
import { NumericInput } from '../../components/NumericInput'
import { LiveFigures } from '../../components/LiveFigures'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { useToastStore } from '../../store/toastStore'
import { localDateInputValue } from '../../utils/date'
import { parseApiError } from '../../utils/apiError'
import { TYPES, TYPE_ICONS, fmtAmt, getPending, typeLabel } from './settlementFormat'

interface RecordSettlementDialogProps {
  pumpId: number
  wallet: WalletSummary | undefined
  /** Unsettled collection days, so the dialog can say which days this settlement clears. */
  pendingRanges: PendingSettlementRange[]
  initialType: SettlementPaymentType
  onClose: () => void
}

interface FieldErrors {
  date?: string
  amount?: string
}

export function RecordSettlementDialog({ pumpId, wallet, pendingRanges, initialType, onClose }: RecordSettlementDialogProps) {
  const { t } = useTranslation(['settlements', 'common'])
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const stillNeededId = useId()
  const typeLabelId = useId()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [form, setForm]           = useState<RecordSettlementRequest>({
    paymentType:    initialType,
    settlementDate: localDateInputValue(),
    amountReceived: 0,
    notes:          '',
    bankReference:  '',
  })

  const recordMutation = useMutation({
    mutationFn: (data: RecordSettlementRequest) => paymentSettlementApi.record(pumpId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements-daily', pumpId] })
      qc.invalidateQueries({ queryKey: ['settlements-wallet', pumpId] })
      qc.invalidateQueries({ queryKey: ['settlements-pending-age', pumpId] })
      onClose()
      addToast(t('record.recorded'), 'success')
    },
    onError: (err) => setServerError(parseApiError(err, t('record.failed'))),
  })

  const pendingNow = wallet ? getPending(wallet, form.paymentType) : 0
  const exceedsPending = wallet !== undefined && form.amountReceived > pendingNow
  const tooHighMessage = t('record.amountTooHigh', { pending: fmtAmt(pendingNow), type: typeLabel(form.paymentType) })

  const handleRecord = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const errors: FieldErrors = {}
    if (!form.settlementDate) errors.date = t('record.dateRequired')
    if (form.amountReceived <= 0) errors.amount = t('record.amountPositive')
    else if (exceedsPending) errors.amount = tooHighMessage
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    recordMutation.mutate({ ...form, notes: form.notes || undefined, bankReference: form.bankReference?.trim() || undefined })
  }

  const coveredDays = daysCoveredBy(pendingRanges, form.paymentType, form.amountReceived)
  const hasAmount = form.amountReceived > 0
  const pendingAfterRecord = Math.max(0, pendingNow - form.amountReceived)

  const stillNeeded = [
    ...(form.settlementDate ? [] : [t('record.needDate')]),
    ...(hasAmount ? [] : [t('record.needAmount')]),
  ]

  const optional = (label: string) => (
    <>{label} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>
  )

  return (
    <Modal
      tone="info"
      title={t('record.title')}
      subtitle={t('record.subtitle')}
      size="lg"
      onClose={onClose}
      canClose={!recordMutation.isPending}
      closeOnBackdropClick
      fullScreenOnPhone
      onSubmit={handleRecord}
      bodyClassName="flex flex-col gap-5"
      footer={<>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
        <button type="button" onClick={onClose} disabled={recordMutation.isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="submit" isLoading={recordMutation.isPending} loadingLabel={t('common:actions.saving')}
          disabled={stillNeeded.length > 0}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          className="ui-btn-primary">
          {t('record.title')}
        </LoadingButton>
      </>}
    >
      <div>
        <span id={typeLabelId} className="ui-label">{t('record.paymentType')}</span>
        <div role="group" aria-labelledby={typeLabelId} className="grid grid-cols-3 gap-2">
          {TYPES.map(type => (
            <button
              key={type}
              type="button"
              aria-pressed={form.paymentType === type}
              onClick={() => setForm(f => ({ ...f, paymentType: type }))}
              className="ui-chip inline-flex min-h-11 items-center justify-center gap-1.5 text-sm"
            >
              <span aria-hidden="true" className="leading-none">{TYPE_ICONS[type]}</span>
              <span>{typeLabel(type)}</span>
            </button>
          ))}
        </div>
      </div>

      <FormGrid>
        <FormField label={t('record.date')} error={fieldErrors.date} help={t('record.dateHint')}>
          <input
            type="date"
            value={form.settlementDate}
            max={localDateInputValue()}
            onChange={e => setForm(f => ({ ...f, settlementDate: e.target.value }))}
            required
          />
        </FormField>
        <FormField label={t('record.amount')} error={fieldErrors.amount ?? (exceedsPending ? tooHighMessage : undefined)}>
          <NumericInput
            unit="₹"
            min={0}
            step={0.01}
            data-autofocus
            value={form.amountReceived || ''}
            onChange={e => setForm(f => ({ ...f, amountReceived: parseFloat(e.target.value) || 0 }))}
            required
          />
        </FormField>

        <FormField label={optional(t('record.bankReference'))} help={t('record.bankReferenceHelp')}>
          <input
            type="text"
            maxLength={100}
            value={form.bankReference ?? ''}
            onChange={e => setForm(f => ({ ...f, bankReference: e.target.value }))}
          />
        </FormField>

        <FormField label={optional(t('common:fields.notes'))}>
          <input
            type="text"
            value={form.notes ?? ''}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </FormField>

        {wallet && (
          <FormGridFullRow>
            <LiveFigures
              label={t('record.afterThis')}
              figures={[
                { label: t('record.currentPending', { type: typeLabel(form.paymentType) }), value: <MoneyText value={pendingNow} /> },
                { label: t('record.thisSettlement'), value: <MoneyText value={hasAmount ? form.amountReceived : null} /> },
                {
                  label: t('record.afterThis'),
                  value: !hasAmount ? <MoneyText value={null} />
                    : pendingAfterRecord > 0 ? <MoneyText value={pendingAfterRecord} />
                    : (
                      <span className="inline-flex items-center gap-1 text-ok">
                        <Check size={14} strokeWidth={2.5} aria-hidden="true" />{t('wallet.fullySettled')}
                      </span>
                    ),
                  isResult: true,
                },
              ]}
            />
          </FormGridFullRow>
        )}
      </FormGrid>

      {coveredDays.length > 0 && (
        <div className="ui-card ui-card-muted px-4 py-3" aria-live="polite">
          <p className="text-xs font-semibold text-ink-2">{t('record.clears', { type: typeLabel(form.paymentType) })}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
            {coveredDays.map((day) => (
              <li key={day.date} className="flex justify-between gap-3">
                <span>{formatIstDate(day.date, { day: 'numeric', month: 'short' })}</span>
                <span className="tabular-nums">
                  {day.covered < day.unsettled
                    ? t('record.partOf', { covered: fmtAmt(day.covered), unsettled: fmtAmt(day.unsettled) })
                    : fmtAmt(day.covered)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
