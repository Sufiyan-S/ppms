import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient, RecordPaymentRequest } from '../../../api/creditApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { localDateInputValue } from '../../../utils/date'
import { formatCurrency } from '../../../utils/format'
import { useToastStore } from '../../../store/toastStore'
import { Modal } from '../../../components/Modal'
import { MoneyText } from '../../../components/AmountText'
import { parseApiError } from '../../../utils/apiError'
import { FormGrid, FormGridFullRow } from '../../../components/layout/FormGrid'
import { FormField } from '../../../components/FormField'
import { NumericInput } from '../../../components/NumericInput'
import { LoadingButton } from '../../../components/LoadingButton'
import { LiveFigures } from '../../../components/LiveFigures'
import { StillNeeded } from '../../../components/StillNeeded'
import { toPaise } from '../../../utils/money'

interface RecordPaymentModalProps {
  client: CreditClient
  pumpId: number
  outstandingBalanceOverride?: number
  subClients?: CreditClient[]
  onClose: () => void
}

/** Each label is common.json paymentMethods.<mode>. */
const PAYMENT_MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'] as const

export function RecordPaymentModal({ client, pumpId, outstandingBalanceOverride, subClients = [], onClose }: RecordPaymentModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [amount, setAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER'>('CASH')
  const [paidAt, setPaidAt] = useState(() => localDateInputValue())
  const [notes, setNotes] = useState('')
  const [amountError, setAmountError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<string | null>(null)
  const [targetClientId, setTargetClientId] = useState<number>(client.id)
  const stillNeededId = useId()
  const modeLabelId = useId()
  const recordForLabelId = useId()

  const targetClient = targetClientId === client.id
    ? client
    : (subClients.find(c => c.id === targetClientId) ?? client)

  const outstandingBalance = targetClientId === client.id
    ? (outstandingBalanceOverride ?? client.outstandingBalance)
    : (targetClient.outstandingBalance ?? 0)

  const enteredAmount = amount === '' ? null : parseFloat(amount)
  const paymentShown = enteredAmount !== null && !isNaN(enteredAmount) ? enteredAmount : null
  const balanceAfterPaise = paymentShown === null ? null : toPaise(outstandingBalance) - toPaise(paymentShown)
  const isOverpaid = balanceAfterPaise !== null && balanceAfterPaise < 0

  const stillNeeded = [
    ...(amount === '' ? [t('recordPayment.amount')] : []),
    ...(paidAt === '' ? [t('recordPayment.date')] : []),
  ]

  const mutation = useMutation({
    mutationFn: (req: RecordPaymentRequest) =>
      creditApi.recordPayment(pumpId, targetClientId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
      qc.invalidateQueries({ queryKey: ['credit-transactions', pumpId, client.id] })
      if (targetClientId !== client.id) {
        qc.invalidateQueries({ queryKey: ['credit-transactions', pumpId, targetClientId] })
      }
      addToast(t('recordPayment.recorded', { name: targetClient.name }), 'success')
      onClose()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('recordPayment.failed'))
      setServerError(msg)
      addToast(msg, 'error')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) {
      setAmountError(t('recordPayment.invalidAmount'))
      return
    }
    if (amt > outstandingBalance) {
      setAmountError(t('recordPayment.exceedsOutstanding', { amount: formatCurrency(outstandingBalance) }))
      return
    }
    setAmountError(undefined)
    mutation.mutate({ amount: amt, paymentMode, paidAt, notes: notes.trim() || undefined })
  }

  return (
    <Modal
      title={t('clientActions.recordPayment')}
      subtitle={client.name}
      tone="info"
      size="md-wide"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')}
            disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn-primary">
            {t('clientActions.recordPayment')}
          </LoadingButton>
        </>
      }
    >
      <FormGrid>
        {subClients.length > 0 && (
          <FormGridFullRow>
            <span id={recordForLabelId} className="ui-label">{t('recordPayment.recordFor')}</span>
            <SearchableSelect aria-labelledby={recordForLabelId}
              value={String(targetClientId)}
              onChange={v => { setTargetClientId(Number(v)); setAmount(''); setAmountError(undefined) }}
              options={[
                { value: String(client.id), label: t('recordPayment.parentOption', { name: client.name }) },
                ...subClients.map(c => ({ value: String(c.id), label: c.name })),
              ]}
            />
          </FormGridFullRow>
        )}

        <FormField label={t('recordPayment.amount')} error={amountError}>
          <NumericInput unit="₹" min="0.01" step="0.01" value={amount}
            onChange={e => { setAmount(e.target.value); setAmountError(undefined) }}
            data-autofocus />
        </FormField>

        <div>
          <span id={modeLabelId} className="ui-label">{t('recordPayment.mode')}</span>
          <SearchableSelect aria-labelledby={modeLabelId}
            value={paymentMode}
            onChange={v => setPaymentMode(v as typeof paymentMode)}
            options={PAYMENT_MODES.map(mode => ({ value: mode, label: t(`common:paymentMethods.${mode}`) }))}
          />
        </div>

        <FormField label={t('recordPayment.date')}>
          <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
        </FormField>

        <FormField
          label={<>{t('common:fields.notes')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>}
          help={t('recordPayment.notesHelp')}
        >
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)} />
        </FormField>
      </FormGrid>

      <LiveFigures
        label={t('recordPayment.figuresLabel')}
        figures={[
          { label: t('recordPayment.outstandingBalance'), value: <MoneyText value={outstandingBalance} /> },
          { label: t('recordPayment.thisPayment'), value: <MoneyText value={paymentShown} /> },
          isOverpaid
            ? { label: t('recordPayment.overpaidBy'), value: <MoneyText value={Math.abs(balanceAfterPaise) / 100} tone="bad" />, isResult: true }
            : { label: t('recordPayment.remainingAfter'), value: <MoneyText value={balanceAfterPaise === null ? null : balanceAfterPaise / 100} />, isResult: true },
        ]}
      />

      {serverError && (
        <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>
      )}
    </Modal>
  )
}
