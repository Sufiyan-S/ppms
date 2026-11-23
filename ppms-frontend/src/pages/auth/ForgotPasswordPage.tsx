import { useState } from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/authApi'
import { parseApiError } from '../../utils/apiError'
import { AuthCard, AuthScreen } from './AuthCard'
import { BackToLogin } from './BackToLogin'

function NoEmailHelp() {
  const { t } = useTranslation('auth')
  return (
    <div className="ui-alert text-sm">
      <p className="font-medium">{t('forgotPassword.noEmailTitle')}</p>
      <p className="mt-1">{t('forgotPassword.noEmailBody')}</p>
    </div>
  )
}

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber.trim()) { setError(t('forgotPassword.phoneRequired')); return }
    setLoading(true); setError(null)
    try {
      await authApi.forgotPassword(phoneNumber.trim())
      setSent(true)
    } catch (err) {
      setError(parseApiError(err))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthScreen>
        <AuthCard
          title={t('forgotPassword.sentTitle')}
          description={t('forgotPassword.sentBody')}
          icon={(
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-bg">
              <Check size={24} strokeWidth={2.5} aria-hidden="true" className="text-ok" />
            </div>
          )}
          footer={<BackToLogin />}
        >
          <p className="text-xs text-ink-3">{t('forgotPassword.linkExpiry')}</p>
          <NoEmailHelp />
        </AuthCard>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen>
      <AuthCard title={t('forgotPassword.title')} description={t('forgotPassword.subtitle')} footer={<BackToLogin />}>
        <NoEmailHelp />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="phoneNumber" className="ui-label">{t('fields.phoneNumber')}</label>
            <input
              id="phoneNumber"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              placeholder={t('forgotPassword.phonePlaceholder')}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'forgot-phone-error' : undefined}
              className="shadow-raised"
            />
            {error && <p id="forgot-phone-error" className="ui-error-text" role="alert">{error}</p>}
          </div>


          <button
            type="submit"
            disabled={loading}
            className="ui-btn ui-btn-primary w-full"
          >
            {loading ? t('forgotPassword.sending') : t('forgotPassword.send')}
          </button>
        </form>
      </AuthCard>
    </AuthScreen>
  )
}
