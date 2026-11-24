import { useTranslation } from 'react-i18next'
import { FormField } from './FormField'
import { PasswordInput } from './PasswordInput'
import type { ChangePasswordForm } from './useChangePasswordForm'

/** The current, new and confirm password fields and the server's refusal, shared by the dialog and the sign-in screen. */
export function ChangePasswordFields({ form }: { form: ChangePasswordForm }) {
  const { t } = useTranslation('auth')
  return (
    <>
      <FormField label={t('fields.currentPassword')}>
        <PasswordInput
          value={form.currentPassword}
          onChange={(e) => form.changeCurrentPassword(e.target.value)}
          autoComplete="current-password"
          data-autofocus
        />
      </FormField>

      <FormField label={t('fields.newPassword')} help={t('passwordPolicy')} error={form.policyError ? t('changePassword.weakPassword') : undefined}>
        <PasswordInput
          value={form.newPassword}
          onChange={(e) => form.changeNewPassword(e.target.value)}
          autoComplete="new-password"
        />
      </FormField>

      <FormField label={t('fields.confirmNewPassword')} error={form.showMismatch ? t('changePassword.mismatch') : undefined}>
        <PasswordInput
          value={form.confirmPassword}
          onChange={(e) => form.changeConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </FormField>

      {form.serverError && <p role="alert" className="ui-alert ui-alert-danger">{form.serverError}</p>}
    </>
  )
}
