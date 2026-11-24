import { useId } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'
import { ChangePasswordFields } from '../../components/ChangePasswordFields'
import { useChangePasswordForm } from '../../components/useChangePasswordForm'
import { Spinner } from '../../components/Spinner'
import { StillNeeded } from '../../components/StillNeeded'
import { getDefaultPath } from '../../permissions/permissions'
import { AuthCard, AuthScreen } from './AuthCard'

/** The only screen a user whose password was set by someone else can use until they choose their own. */
export default function ChangePasswordRequiredPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const stillNeededId = useId()
  const { isAuthenticated, user, clearAuth } = useAuthStore()
  const form = useChangePasswordForm(t('changePassword.requiredSuccess'))

  const signOutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      clearAuth()
      navigate('/login')
    },
  })

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  if (!user?.mustChangePassword) {
    return <Navigate to={getDefaultPath(user?.role)} replace />
  }

  const busy = form.isSaving || signOutMutation.isPending

  return (
    <AuthScreen>
      <AuthCard
        title={t('changePassword.requiredTitle')}
        description={t('changePassword.requiredSubtitle')}
        footer={(
          <button type="button" onClick={() => signOutMutation.mutate()} disabled={busy} className="ui-link">
            {t('changePassword.signOut')}
          </button>
        )}
      >
        <form onSubmit={form.submit} className="ui-auth-form">
          <ChangePasswordFields form={form} />
          <StillNeeded id={stillNeededId} items={form.stillNeeded} />
          <button
            type="submit"
            disabled={busy || form.stillNeeded.length > 0}
            aria-busy={form.isSaving || undefined}
            aria-describedby={form.stillNeeded.length ? stillNeededId : undefined}
            className="ui-btn ui-btn-primary ui-auth-submit"
          >
            {form.isSaving && <Spinner />}
            {form.isSaving ? t('changePassword.submitting') : t('changePassword.submit')}
          </button>
        </form>
      </AuthCard>
    </AuthScreen>
  )
}
