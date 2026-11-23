import { useId, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../../api/pumpApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { LoadingButton } from '../../../components/LoadingButton'
import { StillNeeded } from '../../../components/StillNeeded'
import { parseApiError } from '../../../utils/apiError'

interface ReassignModalProps {
  entryId: number
  currentClientId: number
  pumpId: number
  transactionType: 'SALE' | 'PAYMENT'
  onClose: () => void
}

export function ReassignCreditEntryModal({ entryId, currentClientId, pumpId, transactionType, onClose }: ReassignModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const [toClientId, setToClientId] = useState<string>('')
  const [reason, setReason]         = useState('')
  const [error, setError]           = useState<string | null>(null)
  const moveToLabelId = useId()
  const stillNeededId = useId()
  const isPayment = transactionType === 'PAYMENT'

  const { data: allClients = [] } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn:  () => pumpApi.getCreditClientAccounts(pumpId),
  })

  // Restrict targets to within the same parent/child group only:
  // • Parent account   → can move only to its own sub-accounts
  // • Sub-account      → can move to its parent OR sibling sub-accounts
  // • Standalone       → no valid targets (no group to move within)
  const currentClient = allClients.find(c => c.id === currentClientId)

  let targets: typeof allClients = []
  let noTargetsReason: string | null = null

  if (currentClient?.isParent) {
    targets = allClients.filter(c => c.parentClientId === currentClientId)
    if (targets.length === 0) {
      noTargetsReason = t('reassign.noSubAccounts')
    }
  } else if (currentClient?.parentClientId !== null && currentClient?.parentClientId !== undefined) {
    targets = allClients.filter(c =>
      c.id !== currentClientId &&
      (c.id === currentClient.parentClientId || c.parentClientId === currentClient.parentClientId)
    )
  } else {
    noTargetsReason = t('reassign.standalone')
  }

  const stillNeeded = [
    ...(toClientId === '' ? [t('reassign.moveTo')] : []),
    ...(reason.trim() === '' ? [t('common:fields.reason')] : []),
  ]

  const mutation = useMutation({
    mutationFn: ({ toId, rsn }: { toId: number; rsn: string }) =>
      isPayment
        ? pumpApi.reassignCreditPayment(pumpId, entryId, toId, rsn)
        : pumpApi.reassignCreditEntry(pumpId, entryId, toId, rsn),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
      qc.invalidateQueries({ queryKey: ['credit-transactions', pumpId] })
      onClose()
    },
    onError: (err) => setError(parseApiError(err, isPayment ? t('reassign.failedPayment') : t('reassign.failedEntry'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!toClientId)        { setError(t('reassign.selectTarget')); return }
    if (!reason.trim())     { setError(t('reassign.reasonRequired')); return }
    setError(null)
    mutation.mutate({ toId: Number(toClientId), rsn: reason.trim() })
  }

  return (
    <Modal
      title={t('reassign.title')}
      subtitle={isPayment ? t('reassign.subtitlePayment') : t('reassign.subtitleSale')}
      tone="info"
      size="md"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={noTargetsReason ? undefined : handleSubmit}
      bodyClassName="space-y-4"
      footer={noTargetsReason ? (
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('common:actions.close')}</button>
      ) : (
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('reassign.moving')}
            disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn-primary">
            {t('reassign.submit')}
          </LoadingButton>
        </>
      )}
    >
      {noTargetsReason ? (
        <p className="text-sm text-ink-2">{noTargetsReason}</p>
      ) : (
        <>
          <div>
            <span id={moveToLabelId} className="ui-label">{t('reassign.moveTo')}</span>
            <SearchableSelect aria-labelledby={moveToLabelId}
              value={toClientId}
              onChange={setToClientId}
              placeholder={t('reassign.targetPlaceholder')}
              searchThreshold={0}
              options={targets.map(c => ({
                value: String(c.id),
                label: c.parentClientId === null ? t('reassign.parentOption', { name: c.name }) : c.name,
              }))}
            />
          </div>
          <FormField label={t('common:fields.reason')}>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="resize-none" />
          </FormField>
          {error && <p role="alert" className="ui-alert ui-alert-danger">{error}</p>}
        </>
      )}
    </Modal>
  )
}
