import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient } from '../../../api/creditApi'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { NumericInput } from '../../../components/NumericInput'
import { LoadingButton } from '../../../components/LoadingButton'
import { LiveFigures } from '../../../components/LiveFigures'
import { MoneyText } from '../../../components/AmountText'
import { parseApiError } from '../../../utils/apiError'
import { toPaise } from '../../../utils/money'

interface SetCreditLimitModalProps {
  client: CreditClient
  pumpId: number
  onClose: () => void
}

export function SetCreditLimitModal({ client, pumpId, onClose }: SetCreditLimitModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const [limit, setLimit] = useState(client.creditLimit > 0 ? String(client.creditLimit) : '')
  const [limitError, setLimitError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (creditLimit: number) =>
      creditApi.updateCreditLimit(pumpId, client.id, { creditLimit }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
      onClose()
    },
    onError: (err) => {
      setServerError(parseApiError(err, t('creditLimit.failed')))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    const val = limit.trim() === '' ? 0 : parseFloat(limit)
    if (isNaN(val) || val < 0) {
      setLimitError(t('creditLimit.invalid'))
      return
    }
    setLimitError(undefined)
    mutation.mutate(val)
  }

  const noLimit = <span className="text-ink-2">{t('creditLimit.noLimit')}</span>
  const enteredLimit = limit.trim() === '' ? 0 : parseFloat(limit)
  const newLimit = isNaN(enteredLimit) || enteredLimit < 0 ? null : enteredLimit
  const leftAfterPaise = newLimit === null || newLimit === 0 ? null : toPaise(newLimit) - toPaise(client.outstandingBalance)
  const isOverNewLimit = leftAfterPaise !== null && leftAfterPaise < 0

  return (
    <Modal
      title={t('creditLimit.title')}
      subtitle={client.name}
      tone="info"
      size="md"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')}
            className="ui-btn-primary">
            {t('creditLimit.save')}
          </LoadingButton>
        </>
      }
    >
      <FormField label={t('creditLimit.label')} help={t('creditLimit.help')} error={limitError}>
        <NumericInput unit="₹" min="0" step="0.01" value={limit}
          onChange={e => { setLimit(e.target.value); setLimitError(undefined) }}
          data-autofocus />
      </FormField>

      <LiveFigures
        label={t('creditLimit.figuresLabel')}
        figures={[
          { label: t('creditLimit.outstanding'), value: <MoneyText value={client.outstandingBalance} /> },
          { label: t('creditLimit.currentLimit'), value: client.creditLimit > 0 ? <MoneyText value={client.creditLimit} /> : noLimit },
          { label: t('creditLimit.newLimit'), value: newLimit === null ? <MoneyText value={null} /> : newLimit === 0 ? noLimit : <MoneyText value={newLimit} /> },
          isOverNewLimit
            ? { label: t('creditLimit.overLimitBy'), value: <MoneyText value={Math.abs(leftAfterPaise) / 100} tone="bad" />, isResult: true }
            : { label: t('creditLimit.leftAfter'), value: newLimit === 0 ? noLimit : <MoneyText value={leftAfterPaise === null ? null : leftAfterPaise / 100} />, isResult: true },
        ]}
      />

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
