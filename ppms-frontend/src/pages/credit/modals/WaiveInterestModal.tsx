import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import type { CreditTransaction } from '../../../api/creditApi'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { LoadingButton } from '../../../components/LoadingButton'
import { LiveFigures } from '../../../components/LiveFigures'
import { MoneyText } from '../../../components/AmountText'
import { parseApiError } from '../../../utils/apiError'
import { formatCurrency } from '../../../utils/format'

interface WaiveInterestModalProps {
  pumpId: number
  clientId: number
  charge: CreditTransaction
  onWaived: () => void
  onClose: () => void
}

export function WaiveInterestModal({ pumpId, clientId, charge, onWaived, onClose }: WaiveInterestModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => creditApi.waiveInterestCharge(pumpId, clientId, charge.referenceId, reason.trim()),
    onSuccess: () => {
      onWaived()
      onClose()
    },
    onError: (err) => setServerError(parseApiError(err, t('waiveInterest.failed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!reason.trim()) { setReasonError(t('waiveInterest.reasonRequired')); return }
    setReasonError(undefined)
    mutation.mutate()
  }

  return (
    <Modal
      title={t('waiveInterest.title')}
      subtitle={charge.detail ? `${formatCurrency(charge.amount)} · ${charge.detail}` : formatCurrency(charge.amount)}
      tone="warning"
      size="md"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('waiveInterest.keep')}</button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('waiveInterest.waiving')}
            className="ui-btn-danger">
            {t('waiveInterest.title')}
          </LoadingButton>
        </>
      }
    >
      <LiveFigures figures={[
        { label: t('waiveInterest.charge'), value: <MoneyText value={charge.amount} /> },
        { label: t('waiveInterest.owedAfter'), value: <MoneyText value={0} />, isResult: true },
      ]} />
      <p className="text-sm text-ink-2">{t('waiveInterest.explanation')}</p>
      <FormField label={t('common:fields.reason')} error={reasonError}>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(undefined) }}
          rows={3} maxLength={500} className="resize-none" data-autofocus />
      </FormField>
      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
