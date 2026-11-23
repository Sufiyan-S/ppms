import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { LoadingButton } from './LoadingButton'

interface RejectReasonDialogProps {
  title: string
  subtitle: string
  isPending: boolean
  error: string | null
  onConfirm: (reason: string) => void
  onClose: () => void
}

/** Asks why something is being rejected; the reason is required and is saved with the rejection. */
export function RejectReasonDialog({ title, subtitle, isPending, error, onConfirm, onClose }: RejectReasonDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [missingReason, setMissingReason] = useState(false)

  const confirm = (event: FormEvent) => {
    event.preventDefault()
    if (!reason.trim()) {
      setMissingReason(true)
      return
    }
    setMissingReason(false)
    onConfirm(reason.trim())
  }

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      tone="warning"
      size="md"
      onClose={onClose}
      canClose={!isPending}
      onSubmit={confirm}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={isPending} className="ui-btn ui-btn-secondary">{t('actions.cancel')}</button>
          <LoadingButton type="submit" isLoading={isPending} loadingLabel={t('actions.rejecting')} className="ui-btn-danger">
            {t('actions.reject')}
          </LoadingButton>
        </>
      }
    >
      <FormField label={t('rejectDialog.reason')} help={t('rejectDialog.help')}
        error={missingReason ? t('rejectDialog.missingReason') : undefined}>
        <textarea
          value={reason}
          onChange={(event) => { setReason(event.target.value); if (event.target.value.trim()) setMissingReason(false) }}
          rows={3}
          maxLength={500}
          aria-required="true"
          className="resize-none"
          data-autofocus
        />
      </FormField>
      {error && <p role="alert" className="ui-alert ui-alert-danger">{error}</p>}
    </Modal>
  )
}
