import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '../api/authApi'
import { useAuthStore } from '../store/authStore'
import { PasswordInput } from './PasswordInput'
import { Modal } from './Modal'
import { parseApiError } from '../utils/apiError'
import { PASSWORD_POLICY_REGEX } from '../constants/passwordPolicy'
import { FormField } from './FormField'
import { LoadingButton } from './LoadingButton'
import { StillNeeded } from './StillNeeded'

interface ChangePasswordModalProps {
  onClose: () => void
  successMessage?: string
  /** The password was set by someone else: the dialog cannot be dismissed by a stray click, and leaving it signs out. */
  required?: boolean
}

export function ChangePasswordModal({ onClose, successMessage, required = false }: ChangePasswordModalProps) {
  const { t } = useTranslation(['auth', 'common'])
  const navigate = useNavigate()
  const { clearAuth } = useAuthStore()
  const stillNeededId = useId()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [policyError, setPolicyError] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
    onSuccess: (data) => {
      clearAuth()
      navigate('/login', { state: { message: successMessage ?? data.message } })
    },
    onError: (err) => {
      setServerError(parseApiError(err, t('changePassword.failed')))
    },
  })

  const passwordsDiffer = confirmPassword !== '' && newPassword !== confirmPassword
  // Waits until the confirmation is as long as the new password, so the error does not flash while typing.
  const showMismatch = passwordsDiffer && confirmPassword.length >= newPassword.length
  const stillNeeded = [
    ...(currentPassword ? [] : [t('fields.currentPassword')]),
    ...(newPassword ? [] : [t('fields.newPassword')]),
    ...(confirmPassword ? [] : [t('fields.confirmNewPassword')]),
    ...(passwordsDiffer ? [t('changePassword.passwordsMatch')] : []),
  ]

  const handleChangePassword = (event: FormEvent) => {
    event.preventDefault()
    setServerError(null)
    if (stillNeeded.length > 0) return
    if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
      setPolicyError(true)
      return
    }
    setPolicyError(false)
    changePasswordMutation.mutate({ currentPassword, newPassword })
  }

  return (
    <Modal
      title={required ? t('changePassword.requiredTitle') : t('changePassword.title')}
      subtitle={required ? t('changePassword.requiredSubtitle') : t('changePassword.subtitle')}
      tone="info"
      size="md"
      onClose={onClose}
      canClose={!changePasswordMutation.isPending}
      closeOnBackdropClick={!required}
      onSubmit={handleChangePassword}
      bodyClassName="space-y-4"
      footer={
        <>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <button type="button" onClick={onClose} disabled={changePasswordMutation.isPending} className="ui-btn ui-btn-secondary">
            {required ? t('changePassword.signOut') : t('common:actions.cancel')}
          </button>
          <LoadingButton type="submit" isLoading={changePasswordMutation.isPending} loadingLabel={t('changePassword.submitting')}
            disabled={stillNeeded.length > 0} aria-describedby={stillNeeded.length ? stillNeededId : undefined}
            className="ui-btn-primary">
            {t('changePassword.submit')}
          </LoadingButton>
        </>
      }
    >
      <FormField label={t('fields.currentPassword')}>
        <PasswordInput
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          data-autofocus
        />
      </FormField>

      <FormField label={t('fields.newPassword')} help={t('passwordPolicy')} error={policyError ? t('changePassword.weakPassword') : undefined}>
        <PasswordInput
          value={newPassword}
          onChange={(e) => { setNewPassword(e.target.value); setPolicyError(false) }}
          autoComplete="new-password"
        />
      </FormField>

      <FormField label={t('fields.confirmNewPassword')} error={showMismatch ? t('changePassword.mismatch') : undefined}>
        <PasswordInput
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </FormField>

      {serverError && <p role="alert" className="ui-alert ui-alert-danger">{serverError}</p>}
    </Modal>
  )
}
