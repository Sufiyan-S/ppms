import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '../api/authApi'
import { useAuthStore } from '../store/authStore'
import { PasswordInput } from './PasswordInput'
import { ModalPortal } from './ModalPortal'
import { parseApiError } from '../utils/apiError'
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from '../constants/passwordPolicy'
import { FormField } from './FormField'

interface ChangePasswordModalProps {
  onClose: () => void
  successMessage?: string
}

export function ChangePasswordModal({ onClose, successMessage }: ChangePasswordModalProps) {
  const navigate = useNavigate()
  const { clearAuth } = useAuthStore()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
    onSuccess: (data) => {
      onClose()
      clearAuth()
      navigate('/login', { state: { message: successMessage ?? data.message } })
    },
    onError: (err) => {
      setPasswordError(parseApiError(err, 'Failed to update password.'))
    },
  })

  const handleChangePassword = () => {
    setPasswordError(null)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required.')
      return
    }

    if (!PASSWORD_POLICY_REGEX.test(newPassword)) {
      setPasswordError(PASSWORD_POLICY_MESSAGE)
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password must match.')
      return
    }

    changePasswordMutation.mutate({ currentPassword, newPassword })
  }

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
    <div className="ui-modal-backdrop">
      <div
        className="ui-modal-panel"
      >
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Reset Password</h2>
            <p className="ui-modal-subtitle">Update your password, then sign in again.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        <div className="ui-modal-body space-y-4">
          <div>
            <FormField label="Current Password">
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="shadow-sm"
              />
            </FormField>
          </div>

          <div>
            <FormField label="New Password">
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className="shadow-sm"
              />
            </FormField>
            <p className="ui-help">{PASSWORD_POLICY_MESSAGE}</p>
          </div>

          <div>
            <FormField label="Confirm New Password">
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword() }}
                autoComplete="new-password"
                className="shadow-sm"
              />
            </FormField>
          </div>

          {passwordError && (
            <div className="ui-alert ui-alert-danger" role="alert">
              <p className="text-sm text-red-600">{passwordError}</p>
            </div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button
            onClick={onClose}
            disabled={changePasswordMutation.isPending}
            className="ui-btn ui-btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleChangePassword}
            disabled={changePasswordMutation.isPending}
            className="ui-btn ui-btn-primary"
          >
            {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
