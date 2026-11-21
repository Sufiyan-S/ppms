import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { ConfirmButton } from '../../components/ConfirmButton'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { SetPortalPinModal } from './modals/SetPortalPinModal'

interface PortalPinControlProps {
  pumpId: number
  client: PumpCreditClient
}

export function PortalPinControl({ pumpId, client }: PortalPinControlProps) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [showPinModal, setShowPinModal] = useState(false)

  const removeMutation = useMutation({
    mutationFn: () => pumpApi.removeCreditClientPortalPin(pumpId, client.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      addToast(`Portal PIN removed for ${client.name}`, 'success')
    },
    onError: (err) => addToast(parseApiError(err, 'Failed to remove portal PIN'), 'error'),
  })

  return (
    <>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
        client.hasPortalPin ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}>
        {client.hasPortalPin ? 'Portal PIN set' : 'No portal PIN'}
      </span>
      <button
        type="button"
        onClick={() => setShowPinModal(true)}
        className="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200"
      >
        {client.hasPortalPin ? 'Change PIN' : 'Set portal PIN'}
      </button>
      {client.hasPortalPin && (
        <ConfirmButton
          onConfirm={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          triggerLabel="Remove PIN"
          triggerAriaLabel={`Remove portal PIN for ${client.name}`}
          prompt="Remove PIN?"
          triggerClassName="ui-btn ui-btn-ghost min-h-0 px-2 py-1 text-xs text-red-600 hover:text-red-700 border border-red-200"
        />
      )}
      {showPinModal && (
        <SetPortalPinModal pumpId={pumpId} client={client} onClose={() => setShowPinModal(false)} />
      )}
    </>
  )
}
