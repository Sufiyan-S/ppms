import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { LoadingButton } from '../../components/LoadingButton'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { RowPanel, RowPanelActions } from '../setup/staff/RowPanel'

interface ConfirmPanelProps {
  pumpId: number
  client: PumpCreditClient
  onClose: () => void
}

export function RemovePortalPinPanel({ pumpId, client, onClose }: ConfirmPanelProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const removeMutation = useMutation({
    mutationFn: () => pumpApi.removeCreditClientPortalPin(pumpId, client.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      addToast(t('portalPin.removed', { name: client.name }), 'success')
      onClose()
    },
    onError: (err) => addToast(parseApiError(err, t('portalPin.removeFailed')), 'error'),
  })

  return (
    <RowPanel title={t('portalPin.removeFor', { name: client.name })} hint={t('clients.menu.removePinHint')}>
      <RowPanelActions>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="button" isLoading={removeMutation.isPending} loadingLabel={t('common:actions.saving')} onClick={() => removeMutation.mutate()} className="ui-btn-danger ui-btn-compact">
          {t('portalPin.remove')}
        </LoadingButton>
      </RowPanelActions>
    </RowPanel>
  )
}

export function DisableClientPanel({ pumpId, client, onClose }: ConfirmPanelProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const disableMutation = useMutation({
    mutationFn: () => pumpApi.toggleCreditClientStatus(pumpId, client.id, false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      onClose()
    },
    onError: (err) => addToast(parseApiError(err, t('clients.statusFailed')), 'error'),
  })

  return (
    <RowPanel title={t('clients.disablePrompt')} hint={t('clients.menu.disableHint')}>
      <RowPanelActions>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-compact">
          {t('common:actions.cancel')}
        </button>
        <LoadingButton type="button" isLoading={disableMutation.isPending} loadingLabel={t('common:actions.saving')} onClick={() => disableMutation.mutate()} className="ui-btn-danger ui-btn-compact">
          {t('common:actions.disable')}
        </LoadingButton>
      </RowPanelActions>
    </RowPanel>
  )
}
