import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CircleCheck } from 'lucide-react'
import { userApi } from '../api/userApi'
import { PasswordInput } from './PasswordInput'
import { Modal } from './Modal'
import { FormField } from './FormField'
import { LoadingButton } from './LoadingButton'
import { StillNeeded } from './StillNeeded'
import { parseApiError } from '../utils/apiError'
import { PASSWORD_POLICY_REGEX } from '../constants/passwordPolicy'

interface ResetPasswordDialogProps {
  userId: number
  userName: string
  onClose: () => void
}

/** Sets a temporary password for someone else; they are signed out everywhere and must choose their own at next sign-in. */
export function ResetPasswordDialog({ userId, userName, onClose }: ResetPasswordDialogProps) {
  const { t } = useTranslation(['auth', 'common'])
  const stillNeededId = useId()
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [policyError, setPolicyError] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const resetMutation = useMutation({
    mutationFn: () => userApi.resetPassword(userId, temporaryPassword),
    onError: (err) => setServerError(parseApiError(err, t('resetPasswordDialog.failed'))),
  })

  const passwordsDiffer = confirmPassword !== '' && temporaryPassword !== confirmPassword
  // Waits until the confirmation is as long as the password, so the error does not flash while typing.
  const showMismatch = passwordsDiffer && confirmPassword.length >= temporaryPassword.length
  const stillNeeded = [
    ...(temporaryPassword ? [] : [t('fields.temporaryPassword')]),
    ...(confirmPassword ? [] : [t('fields.confirmTemporaryPassword')]),
    ...(passwordsDiffer ? [t('resetPasswordDialog.passwordsMatch')] : []),
  ]

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setServerError(null)
    if (stillNeeded.length > 0) return
    if (!PASSWORD_POLICY_REGEX.test(temporaryPassword)) {
      setPolicyError(true)
      return
    }
    setPolicyError(false)
    resetMutation.mutate()
  }

  return (
    <Modal
      title={t('resetPasswordDialog.title')}
      subtitle={t('resetPasswordDialog.subtitle', { name: userName })}
      tone="warning"
      size="md"
      onClose={onClose}
      canClose={!resetMutation.isPending}
      closeOnBackdropClick
      confirmDiscard={!resetMutation.isSuccess}
      onSubmit={resetMutation.isSuccess ? undefined : submit}
      bodyClassName="space-y-4"
      footer={resetMutation.isSuccess ? (
        <button type="button" onClick={onClose} className="ui-btn ui-btn-primary">{t('common:actions.done')}</button>
      ) : (
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} disabled={resetMutation.isPending} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <LoadingButton type="submit" isLoading={resetMutation.isPending} loadingLabel={t('resetPasswordDialog.submitting')}
            disabled={stillNeeded.length > 0} aria-describedby={stillNeeded.length ? stillNeededId : undefined}
            className="ui-btn-primary">
            {t('resetPasswordDialog.submit')}
          </LoadingButton>
        </>
      )}
    >
      {resetMutation.isSuccess ? (
        <p role="status" className="flex items-start gap-2 text-sm text-ink">
          <CircleCheck size={18} aria-hidden="true" className="mt-px shrink-0 text-ok" />
          {t('resetPasswordDialog.success', { name: userName })}
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-2">{t('resetPasswordDialog.consequence', { name: userName })}</p>
          <FormField label={t('fields.temporaryPassword')} help={t('passwordPolicy')}
            error={policyError ? t('resetPasswordDialog.weakPassword') : undefined}>
            <PasswordInput
              value={temporaryPassword}
              onChange={(e) => { setTemporaryPassword(e.target.value); setPolicyError(false) }}
              autoComplete="new-password"
              data-autofocus
            />
          </FormField>
          <FormField label={t('fields.confirmTemporaryPassword')} error={showMismatch ? t('resetPasswordDialog.mismatch') : undefined}>
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
          {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
        </>
      )}
    </Modal>
  )
}
