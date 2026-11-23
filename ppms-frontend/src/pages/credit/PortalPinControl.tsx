import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { KeyRound, Minus } from 'lucide-react'
import { ConfirmButton } from '../../components/ConfirmButton'
import { StatusBadge } from '../../components/StatusBadge'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { SetPortalPinModal } from './modals/SetPortalPinModal'

interface PortalPinControlProps {
  pumpId: number
  client: PumpCreditClient
}

export function PortalPinControl({ pumpId, client }: PortalPinControlProps) {
  const { t } = useTranslation('credit')
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [showPinModal, setShowPinModal] = useState(false)

  const removeMutation = useMutation({
    mutationFn: () => pumpApi.removeCreditClientPortalPin(pumpId, client.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      addToast(t('portalPin.removed', { name: client.name }), 'success')
    },
    onError: (err) => addToast(parseApiError(err, t('portalPin.removeFailed')), 'error'),
  })

  return (
    <>
      {client.hasPortalPin
        ? <StatusBadge tone="ok" icon={KeyRound} label={t('portalPin.set')} />
        : <StatusBadge tone="neutral" icon={Minus} label={t('portalPin.none')} />}
      <button
        type="button"
        onClick={() => setShowPinModal(true)}
        className="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-primary hover:text-primary-strong border border-border"
      >
        {client.hasPortalPin ? t('portalPin.change') : t('portalPin.setAction')}
      </button>
      {client.hasPortalPin && (
        <ConfirmButton
          onConfirm={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          triggerLabel={t('portalPin.remove')}
          triggerAriaLabel={t('portalPin.removeFor', { name: client.name })}
          prompt={t('portalPin.removePrompt')}
          triggerClassName="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-bad hover:text-bad-strong border border-bad/30"
        />
      )}
      {showPinModal && (
        <SetPortalPinModal pumpId={pumpId} client={client} onClose={() => setShowPinModal(false)} />
      )}
    </>
  )
}
