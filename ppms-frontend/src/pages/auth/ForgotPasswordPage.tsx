import { useState } from 'react'
import { Check, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/authApi'
import { Spinner } from '../../components/Spinner'
import { parseApiError } from '../../utils/apiError'
import { AuthCard, AuthScreen } from './AuthCard'
import { BackToLogin } from './BackToLogin'
import { PhoneNumberField } from './PhoneNumberField'

function NoEmailHelp() {
  const { t } = useTranslation('auth')
  return (
    <div className="ui-auth-notice">
      <Info size={18} strokeWidth={2} aria-hidden="true" className="ui-auth-notice__icon" />
      <div>
        <p className="ui-auth-notice__title">{t('forgotPassword.noEmailTitle')}</p>
        <p>{t('forgotPassword.noEmailBody')}</p>
      </div>
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
    if (!phoneNumber) { setError(t('forgotPassword.phoneRequired')); return }
    setLoading(true); setError(null)
    try {
      await authApi.forgotPassword(phoneNumber)
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

        <form onSubmit={handleSubmit} className="ui-auth-form">
          <PhoneNumberField
            id="phoneNumber"
            value={phoneNumber}
            onChange={setPhoneNumber}
            placeholder={t('forgotPassword.phonePlaceholder')}
            error={error ?? undefined}
            readOnly={loading}
          />

          <button type="submit" disabled={loading} aria-busy={loading || undefined} className="ui-btn ui-btn-primary ui-auth-submit">
            {loading && <Spinner />}
            {loading ? t('forgotPassword.sending') : t('forgotPassword.send')}
          </button>
        </form>
      </AuthCard>
    </AuthScreen>
  )
}
