import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'
import { ChangePasswordModal } from '../../components/ChangePasswordModal'
import { getDefaultPath } from '../../permissions/permissions'
import { AuthScreen } from './AuthCard'

/** The only screen a user whose password was set by someone else can use until they choose their own. */
export default function ChangePasswordRequiredPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const { isAuthenticated, user, clearAuth } = useAuthStore()

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

  return (
    <AuthScreen>
      <ChangePasswordModal
        required
        onClose={() => signOutMutation.mutate()}
        successMessage={t('changePassword.requiredSuccess')}
      />
    </AuthScreen>
  )
}
