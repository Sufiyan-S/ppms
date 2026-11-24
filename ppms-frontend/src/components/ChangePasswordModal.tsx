import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import { LoadingButton } from './LoadingButton'
import { StillNeeded } from './StillNeeded'
import { ChangePasswordFields } from './ChangePasswordFields'
import { useChangePasswordForm } from './useChangePasswordForm'

interface ChangePasswordModalProps {
  onClose: () => void
  successMessage?: string
}

export function ChangePasswordModal({ onClose, successMessage }: ChangePasswordModalProps) {
  const { t } = useTranslation(['auth', 'common'])
  const stillNeededId = useId()
  const form = useChangePasswordForm(successMessage)

  return (
    <Modal
      title={t('changePassword.title')}
      subtitle={t('changePassword.subtitle')}
      tone="info"
      size="md"
      onClose={onClose}
      canClose={!form.isSaving}
      closeOnBackdropClick
      onSubmit={form.submit}
      bodyClassName="space-y-4"
      footer={
        <>
          <StillNeeded id={stillNeededId} items={form.stillNeeded} />
          <button type="button" onClick={onClose} disabled={form.isSaving} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <LoadingButton type="submit" isLoading={form.isSaving} loadingLabel={t('changePassword.submitting')}
            disabled={form.stillNeeded.length > 0} aria-describedby={form.stillNeeded.length ? stillNeededId : undefined}
            className="ui-btn-primary">
            {t('changePassword.submit')}
          </LoadingButton>
        </>
      }
    >
      <ChangePasswordFields form={form} />
    </Modal>
  )
}
