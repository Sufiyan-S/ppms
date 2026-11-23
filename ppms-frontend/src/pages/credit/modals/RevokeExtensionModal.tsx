import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../../../api/creditApi'
import type { CreditExtension } from '../../../api/creditApi'
import { Modal } from '../../../components/Modal'
import { FormField } from '../../../components/FormField'
import { LoadingButton } from '../../../components/LoadingButton'
import { parseApiError } from '../../../utils/apiError'
import { extensionSummary } from '../extensionSummary'

interface RevokeExtensionModalProps {
  pumpId: number
  extension: CreditExtension
  onClose: () => void
}

export function RevokeExtensionModal({ pumpId, extension, onClose }: RevokeExtensionModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [serverError, setServerError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => creditApi.revokeExtension(pumpId, extension.clientId, extension.id, reason.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-extensions', pumpId, extension.clientId] })
      onClose()
    },
    onError: (err) => setServerError(parseApiError(err, t('revokeExtension.failed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setServerError(null)
    if (!reason.trim()) { setReasonError(t('revokeExtension.reasonRequired')); return }
    setReasonError(undefined)
    mutation.mutate()
  }

  return (
    <Modal
      title={t('revokeExtension.title')}
      subtitle={t('revokeExtension.subtitle', { summary: extensionSummary(extension), date: extension.expiryDate })}
      tone="warning"
      size="md"
      onClose={onClose}
      canClose={!mutation.isPending}
      onSubmit={handleSubmit}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('revokeExtension.keep')}</button>
          <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('revokeExtension.revoking')}
            className="ui-btn-danger">
            {t('revokeExtension.title')}
          </LoadingButton>
        </>
      }
    >
      <p className="text-sm text-ink-2">{t('revokeExtension.explanation')}</p>
      <FormField label={t('common:fields.reason')} error={reasonError}>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(undefined) }}
          rows={3} maxLength={500} className="resize-none" data-autofocus />
      </FormField>
      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
