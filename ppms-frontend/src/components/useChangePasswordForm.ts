import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '../api/authApi'
import { useAuthStore } from '../store/authStore'
import { parseApiError } from '../utils/apiError'
import { PASSWORD_POLICY_REGEX } from '../constants/passwordPolicy'

/** The state, checks and save behind every change-password form; a saved change signs out and goes to sign-in. */
export function useChangePasswordForm(successMessage?: string) {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const { clearAuth } = useAuthStore()
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

  const submit = (event: FormEvent) => {
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

  return {
    currentPassword,
    newPassword,
    confirmPassword,
    changeCurrentPassword: setCurrentPassword,
    changeNewPassword: (value: string) => { setNewPassword(value); setPolicyError(false) },
    changeConfirmPassword: setConfirmPassword,
    policyError,
    showMismatch,
    serverError,
    stillNeeded,
    isSaving: changePasswordMutation.isPending,
    submit,
  }
}

export type ChangePasswordForm = ReturnType<typeof useChangePasswordForm>
