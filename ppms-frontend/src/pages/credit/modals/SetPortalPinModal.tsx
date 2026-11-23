import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../../api/pumpApi'
import { FormField } from '../../../components/FormField'
import { Modal } from '../../../components/Modal'
import { PasswordInput } from '../../../components/PasswordInput'
import { LoadingButton } from '../../../components/LoadingButton'
import { PORTAL_PIN_PATTERN, digitsOnly } from '../../../constants/portalPin'
import { useToastStore } from '../../../store/toastStore'
import { parseApiError } from '../../../utils/apiError'

interface SetPortalPinModalProps {
  pumpId: number
  client: PumpCreditClient
  onClose: () => void
}

export function SetPortalPinModal({ pumpId, client, onClose }: SetPortalPinModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | undefined>()

  const mutation = useMutation({
    mutationFn: () => pumpApi.setCreditClientPortalPin(pumpId, client.id, pin),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creditClients', pumpId] })
      addToast(t('portalPin.saved', { name: client.name }), 'success')
      onClose()
    },
    onError: (err) => setError(parseApiError(err, t('portalPin.saveFailed'))),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!PORTAL_PIN_PATTERN.test(pin)) {
      setError(t('portalPin.invalid'))
      return
    }
    setError(undefined)
    mutation.mutate()
  }

  return (
    <Modal
      title={client.hasPortalPin ? t('portalPin.changeTitle') : t('portalPin.setAction')}
      subtitle={client.name}
      tone="info"
      size="md"
      canClose={!mutation.isPending}
      onClose={onClose}
      onSubmit={submit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('common:actions.cancel')}</button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
            {t('portalPin.save')}
          </LoadingButton>
        </>
      }
    >
      <FormField
        label={t('portalPin.label')}
        error={error}
        help={t('portalPin.help')}
      >
        <PasswordInput
          toggleLabel={t('portalPin.show')}
          value={pin}
          onChange={e => setPin(digitsOnly(e.target.value))}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          data-autofocus
        />
      </FormField>
    </Modal>
  )
}
