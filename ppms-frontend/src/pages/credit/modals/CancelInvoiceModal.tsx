import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import type { CreditInvoice } from '../../../api/creditApi'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { LoadingButton } from '../../../components/LoadingButton'
import { LiveFigures } from '../../../components/LiveFigures'
import { MoneyText } from '../../../components/AmountText'
import { parseApiError } from '../../../utils/apiError'
import { formatIstDate } from '../../../utils/date'
import { useToastStore } from '../../../store/toastStore'

interface CancelInvoiceModalProps {
  invoice: CreditInvoice
  pumpId: number
  onClose: () => void
}

export function CancelInvoiceModal({ invoice, pumpId, onClose }: CancelInvoiceModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => creditApi.cancelInvoice(pumpId, invoice.id, reason.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-invoices', pumpId] })
      addToast(t('cancelInvoice.cancelled', { number: invoice.invoiceNumber }), 'success')
      onClose()
    },
    onError: (err) => setServerError(parseApiError(err, t('cancelInvoice.failed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!reason.trim()) { setReasonError(t('cancelInvoice.reasonRequired')); return }
    setReasonError(undefined)
    mutation.mutate()
  }

  return (
    <Modal
      title={t('cancelInvoice.title')}
      subtitle={invoice.invoiceNumber}
      tone="danger"
      size="md"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('cancelInvoice.keep')}</button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('cancelInvoice.cancelling')}
            className="ui-btn-danger">
            {t('cancelInvoice.title')}
          </LoadingButton>
        </>
      }
    >
      <LiveFigures figures={[
        { label: t('invoicePanel.buyer'), value: invoice.buyerName },
        { label: t('cancelInvoice.period'), value: `${formatIstDate(invoice.periodFrom)} – ${formatIstDate(invoice.periodTo)}` },
        { label: t('invoicePanel.grandTotal'), value: <MoneyText value={invoice.grandTotal} />, isResult: true },
      ]} />
      <p className="text-sm text-ink-2">{t('cancelInvoice.explanation')}</p>
      <FormField label={t('common:fields.reason')} error={reasonError}>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(undefined) }}
          rows={3} maxLength={500} className="resize-none" data-autofocus />
      </FormField>
      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
