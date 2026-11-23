import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Fuel, BarChart2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { authApi } from '../../api/authApi'
import { useAuthStore } from '../../store/authStore'
import type { AuthUser } from '../../types/auth'
import { PasswordInput } from '../../components/PasswordInput'
import { loginErrorMessage } from './loginErrorMessage'
import { CHANGE_PASSWORD_PATH, getDefaultPath } from '../../permissions/permissions'
import { prefetchLandingPage } from '../../routes/pageLoaders'
import { AuthCard, AuthScreen } from './AuthCard'

function loginSchema(t: TFunction<'auth'>) {
  return z.object({
    phoneNumber: z.string().length(10, t('login.phoneLength')).regex(/^\d+$/, t('login.phoneDigits')),
    password: z.string().min(1, t('login.passwordRequired')),
  })
}

type LoginFormData = z.infer<ReturnType<typeof loginSchema>>

export default function LoginPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const sessionExpired = searchParams.get('reason') === 'session_expired'
  const successMessage = (location.state as { message?: string } | null)?.message ?? null
  const setAuth = useAuthStore((s) => s.setAuth)
  const [serverError, setServerError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const schema = useMemo(() => loginSchema(t), [t])
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)
    setLoading(true)
    try {
      const response = await authApi.login(data)
      const user: AuthUser = {
        userId: response.userId,
        fullName: response.fullName,
        role: response.role,
        assignedPumpId: response.assignedPumpId,
        mustChangePassword: response.mustChangePassword,
        preferredLanguage: response.preferredLanguage,
      }
      setAuth(user)
      if (response.mustChangePassword) {
        navigate(CHANGE_PASSWORD_PATH)
        return
      }
      const landingPath = getDefaultPath(response.role)
      prefetchLandingPage(landingPath)
      navigate(landingPath)
    } catch (err: unknown) {
      setServerError(loginErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScreen>
      <div className="ui-auth-frame">
        <section className="ui-auth-hero max-md:hidden" aria-label={t('login.badge')}>
          <div className="ui-auth-badge">
            <Fuel size={13} strokeWidth={2.2} />
            <span>{t('login.badge')}</span>
          </div>
          <div className="space-y-4">
            <p className="ui-auth-display">{t('login.headline')}</p>
            <p className="ui-auth-copy">{t('login.intro')}</p>
          </div>
          <div className="ui-auth-metrics">
            <div className="ui-auth-metric">
              <span className="ui-auth-metric-value">{t('login.metricLive')}</span>
              <span className="ui-auth-metric-label">{t('login.metricLiveLabel')}</span>
            </div>
            <div className="ui-auth-metric">
              <span className="ui-auth-metric-value">{t('login.metricFast')}</span>
              <span className="ui-auth-metric-label">{t('login.metricFastLabel')}</span>
            </div>
          </div>
          <div className="ui-auth-points">
            <div className="ui-auth-point">
              <span className="ui-auth-point-icon">
                <BarChart2 size={17} strokeWidth={2} className="text-accent" />
              </span>
              <div>
                <p className="ui-auth-point-title">{t('login.dailyControlTitle')}</p>
                <p className="ui-auth-point-copy">{t('login.dailyControlCopy')}</p>
              </div>
            </div>
            <div className="ui-auth-point">
              <span className="ui-auth-point-icon">
                <ShieldCheck size={17} strokeWidth={2} className="text-accent" />
              </span>
              <div>
                <p className="ui-auth-point-title">{t('login.secureAccessTitle')}</p>
                <p className="ui-auth-point-copy">{t('login.secureAccessCopy')}</p>
              </div>
            </div>
          </div>
        </section>

        <AuthCard
          title={t('login.title')}
          description={t('login.subtitle')}
          className="ui-auth-form-panel"
          footer={(
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
              <span className="text-ink-3">{t('login.needHelp')}</span>
              <Link to="/forgot-password" className="ui-link text-sm">{t('login.forgotPassword')}</Link>
            </p>
          )}
        >

          {sessionExpired && (
            <div className="ui-alert ui-alert-warning flex items-start gap-2.5">
              <AlertTriangle size={16} strokeWidth={2} className="text-warn flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warn-strong">{t('login.sessionExpiredTitle')}</p>
                <p className="text-xs text-warn mt-0.5">{t('login.sessionExpiredBody')}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="ui-alert ui-alert-success">
              <p className="text-sm text-ok">{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label htmlFor="phoneNumber" className="ui-label">
                {t('fields.phoneNumber')}
              </label>
              <input
                id="phoneNumber"
                {...register('phoneNumber')}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                placeholder={t('login.phonePlaceholder')}
                className="shadow-raised"
              />
              {errors.phoneNumber && (
                <p className="ui-error-text" role="alert">{errors.phoneNumber.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="ui-label">
                {t('fields.password')}
              </label>
              <PasswordInput
                id="password"
                {...register('password')}
                autoComplete="current-password"
                className="shadow-raised"
              />
              {errors.password && (
                <p className="ui-error-text" role="alert">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <p className="ui-alert ui-alert-danger" role="alert">{serverError}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="ui-btn ui-btn-primary w-full"
            >
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>
        </AuthCard>
      </div>
    </AuthScreen>
  )
}
