import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/authApi'
import { PasswordInput } from '../../components/PasswordInput'
import { FormField } from '../../components/FormField'
import { parseApiError } from '../../utils/apiError'
import { PASSWORD_POLICY_REGEX } from '../../constants/passwordPolicy'
import { AuthCard, AuthScreen } from './AuthCard'
import { BackToLogin } from './BackToLogin'

export default function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  if (!token) {
    return (
      <AuthScreen>
        <AuthCard
          title={t('resetPassword.invalidLinkTitle')}
          description={t('resetPassword.invalidLinkBody')}
          icon={(
            <div className="flex h-12 w-12 items-center justify-center rounded-card bg-warn-bg">
              <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" className="text-warn" />
            </div>
          )}
          footer={<BackToLogin />}
        >
          <Link to="/forgot-password" className="ui-btn ui-btn-primary w-full">
            {t('resetPassword.requestNewLink')}
          </Link>
        </AuthCard>
      </AuthScreen>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setPasswordError(null); setConfirmError(null)
    if (!PASSWORD_POLICY_REGEX.test(newPassword)) { setPasswordError(t('passwordPolicy')); return }
    if (newPassword !== confirmPassword) { setConfirmError(t('resetPassword.mismatch')); return }
    setLoading(true)
    try {
      await authApi.resetPassword(token, newPassword)
      navigate('/login', { state: { message: t('resetPassword.success') } })
    } catch (err) {
      setError(parseApiError(err, t('resetPassword.failed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScreen>
      <AuthCard title={t('resetPassword.title')} description={t('resetPassword.subtitle')} footer={<BackToLogin />}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label={t('fields.newPassword')} help={t('passwordPolicy')} error={passwordError ?? undefined}>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="shadow-raised"
              minLength={8}
              required
            />
          </FormField>

          <FormField label={t('fields.confirmPassword')} error={confirmError ?? undefined}>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="shadow-raised"
              required
            />
          </FormField>

          {error && <p className="ui-error-text" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="ui-btn ui-btn-primary w-full"
          >
            {loading ? t('resetPassword.submitting') : t('resetPassword.submit')}
          </button>
        </form>
      </AuthCard>
    </AuthScreen>
  )
}
