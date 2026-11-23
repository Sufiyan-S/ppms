import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { Settlement } from '../../api/paymentSettlementApi'
import { Modal } from '../../components/Modal'
import { FormField } from '../../components/FormField'
import { MoneyText } from '../../components/AmountText'
import { LoadingButton } from '../../components/LoadingButton'
import { StillNeeded } from '../../components/StillNeeded'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { fmtAmt, fmtDate, typeLabel } from './settlementFormat'

interface VoidSettlementDialogProps {
  pumpId: number
  voidTarget: Settlement
  onClose: () => void
}

export function VoidSettlementDialog({ pumpId, voidTarget, onClose }: VoidSettlementDialogProps) {
  const { t } = useTranslation(['settlements', 'common'])
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const stillNeededId = useId()
  const [voidReason, setVoidReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      paymentSettlementApi.voidSettlement(pumpId, id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements-daily', pumpId] })
      qc.invalidateQueries({ queryKey: ['settlements-wallet', pumpId] })
      onClose()
      addToast(t('void.voided'), 'success')
    },
    onError: (err) => setServerError(parseApiError(err, t('void.failed'))),
  })

  const handleVoid = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!voidReason.trim()) { setReasonError(t('void.reasonRequired')); return }
    setReasonError(null)
    voidMutation.mutate({ id: voidTarget.id, reason: voidReason.trim() })
  }

  const stillNeeded = voidReason.trim() ? [] : [t('void.needReason')]
  const type = typeLabel(voidTarget.paymentType)

  return (
    <Modal
      tone="warning"
      title={t('void.title')}
      subtitle={`${type} · ${fmtDate(voidTarget.settlementDate)} · ${fmtAmt(voidTarget.amountReceived)}`}
      size="md-wide"
      onClose={onClose}
      canClose={!voidMutation.isPending}
      closeOnBackdropClick
      onSubmit={handleVoid}
      bodyClassName="flex flex-col gap-4"
      footer={<>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
        <button type="button" onClick={onClose} disabled={voidMutation.isPending} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="submit" isLoading={voidMutation.isPending} loadingLabel={t('void.voiding')}
          disabled={stillNeeded.length > 0}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          className="ui-btn-danger">
          {t('void.title')}
        </LoadingButton>
      </>}
    >
      <p className="text-sm text-ink-2">{t('void.explanation')}</p>
      <dl className="ui-card-plain ui-card-muted divide-y divide-border overflow-hidden text-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-ink-2">{t('details.amountReceived')}</dt>
          <dd><MoneyText value={voidTarget.amountReceived} className="font-semibold text-ink" /></dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <dt className="text-ink-2">{t('void.pendingRises', { type })}</dt>
          <dd><MoneyText value={voidTarget.amountReceived} showSign className="font-semibold text-ink" /></dd>
        </div>
      </dl>
      <FormField label={t('common:fields.reason')} error={reasonError ?? undefined}>
        <input
          type="text"
          value={voidReason}
          onChange={e => setVoidReason(e.target.value)}
          data-autofocus
        />
      </FormField>

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
