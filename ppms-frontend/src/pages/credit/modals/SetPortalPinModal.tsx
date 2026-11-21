import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pumpApi } from '../../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../../api/pumpApi'
import { FormField } from '../../../components/FormField'
import { ModalPortal } from '../../../components/ModalPortal'
import { PasswordInput } from '../../../components/PasswordInput'
import { Spinner } from '../../../components/Spinner'
import { PORTAL_PIN_PATTERN, digitsOnly } from '../../../constants/portalPin'
import { useToastStore } from '../../../store/toastStore'
import { parseApiError } from '../../../utils/apiError'

interface SetPortalPinModalProps {
  pumpId: number
  client: PumpCreditClient
  onClose: () => void
}

export function SetPortalPinModal({ pumpId, client, onClose }: SetPortalPinModalProps) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | undefined>()

  const mutation = useMutation({
    mutationFn: () => pumpApi.setCreditClientPortalPin(pumpId, client.id, pin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      addToast(`Portal PIN saved for ${client.name}`, 'success')
      onClose()
    },
    onError: (err) => setError(parseApiError(err, 'Failed to save portal PIN')),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!PORTAL_PIN_PATTERN.test(pin)) {
      setError('PIN must be 4 to 6 digits')
      return
    }
    setError(undefined)
    mutation.mutate()
  }

  return (
    <ModalPortal onClose={onClose}>
      <div className="ui-modal-backdrop">
        <form onSubmit={submit} className="ui-modal-panel">
          <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
            <div className="ui-modal-heading">
              <h2 className="ui-modal-title">{client.hasPortalPin ? 'Change portal PIN' : 'Set portal PIN'}</h2>
              <p className="ui-modal-subtitle">{client.name}</p>
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
          </div>

          <div className="ui-modal-body space-y-4">
            <FormField
              label="Portal PIN"
              error={error}
              help="The client enters this PIN with their phone number to check their balance. It cannot be viewed later, so share it with the client now."
            >
              <PasswordInput
                toggleLabel="Show PIN"
                value={pin}
                onChange={e => setPin(digitsOnly(e.target.value))}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="4 to 6 digits"
                className="text-sm"
                data-autofocus
              />
            </FormField>
          </div>

          <div className="ui-modal-footer">
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="ui-btn ui-btn-primary">
              {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Saving…</span> : 'Save PIN'}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}
