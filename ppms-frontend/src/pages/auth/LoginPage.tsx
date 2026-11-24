import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useController, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { authApi } from '../../api/authApi'
import { userApi } from '../../api/userApi'
import { useAuthStore } from '../../store/authStore'
import type { AppLanguage } from '../../i18n/languages'
import { PasswordInput } from '../../components/PasswordInput'
import { Spinner } from '../../components/Spinner'
import { loginErrorMessage } from './loginErrorMessage'
import { CHANGE_PASSWORD_PATH, getDefaultPath } from '../../permissions/permissions'
import { prefetchLandingPage } from '../../routes/pageLoaders'
import { AuthCard, AuthScreen } from './AuthCard'
import { PhoneNumberField } from './PhoneNumberField'
import { forgetRememberedPhone, readRememberedPhone, rememberPhone } from './rememberedPhone'
import { useCapsLock } from './useCapsLock'
import { hasFinePointer } from './hasFinePointer'

function loginSchema(t: TFunction<'auth'>) {
  return z.object({
    phoneNumber: z.string().length(10, t('login.phoneLength')).regex(/^\d+$/, t('login.phoneDigits')),
    password: z.string().min(1, t('login.passwordRequired')),
  })
}

type LoginFormData = z.infer<ReturnType<typeof loginSchema>>

function saveLanguageToProfile(language: AppLanguage) {
  userApi.updateMyLanguage(language).catch((error: unknown) => {
    console.warn('Could not save the language picked at sign-in to the profile; it applies on this device only', error)
  })
}

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
  const [rememberedPhone] = useState(readRememberedPhone)
  const [rememberNumber, setRememberNumber] = useState(rememberedPhone !== null)
  const pickedLanguage = useRef<AppLanguage | null>(null)
  const { capsLockOn, checkCapsLock } = useCapsLock()

  const schema = useMemo(() => loginSchema(t), [t])
  const { control, register, handleSubmit, setFocus, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(schema),
    defaultValues: { phoneNumber: rememberedPhone ?? '', password: '' },
  })
  const { field: phoneField } = useController({ name: 'phoneNumber', control })

  useEffect(() => {
    if (hasFinePointer()) setFocus(rememberedPhone ? 'password' : 'phoneNumber')
  }, [rememberedPhone, setFocus])

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null)
    setLoading(true)
    try {
      const response = await authApi.login(data)
      if (rememberNumber) rememberPhone(data.phoneNumber)
      else forgetRememberedPhone()
      const language = pickedLanguage.current
      const keepPickedLanguage = language !== null && language !== response.preferredLanguage
      setAuth({
        userId: response.userId,
        fullName: response.fullName,
        role: response.role,
        assignedPumpId: response.assignedPumpId,
        mustChangePassword: response.mustChangePassword,
        preferredLanguage: keepPickedLanguage ? language : response.preferredLanguage,
      })
      if (response.mustChangePassword) {
        navigate(CHANGE_PASSWORD_PATH)
        return
      }
      if (keepPickedLanguage) saveLanguageToProfile(language)
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
      <AuthCard
        title={t('login.title')}
        description={t('login.subtitle')}
        onLanguagePicked={(language) => { pickedLanguage.current = language }}
        footer={(
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="text-ink-3">{t('login.needHelp')}</span>
            <Link to="/forgot-password" className="ui-link text-sm">{t('login.forgotPassword')}</Link>
          </p>
        )}
      >
        {sessionExpired && (
          <div className="ui-auth-notice ui-auth-notice--warning" role="status">
            <AlertTriangle size={18} strokeWidth={2} aria-hidden="true" className="ui-auth-notice__icon" />
            <div>
              <p className="ui-auth-notice__title">{t('login.sessionExpiredTitle')}</p>
              <p>{t('login.sessionExpiredBody')}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="ui-auth-notice ui-auth-notice--success" role="status">
            <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" className="ui-auth-notice__icon" />
            <p>{successMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="ui-auth-form">
          <PhoneNumberField
            id="phoneNumber"
            value={phoneField.value}
            onChange={phoneField.onChange}
            onBlur={phoneField.onBlur}
            inputRef={phoneField.ref}
            placeholder={t('login.phonePlaceholder')}
            error={errors.phoneNumber?.message}
            readOnly={loading}
          />

          <div>
            <label htmlFor="password" className="ui-label">{t('fields.password')}</label>
            <PasswordInput
              id="password"
              {...register('password')}
              onKeyDown={checkCapsLock}
              onKeyUp={checkCapsLock}
              autoComplete="current-password"
              readOnly={loading}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            <p className="ui-auth-caps" aria-live="polite">
              {capsLockOn && <><AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />{t('login.capsLockOn')}</>}
            </p>
            {errors.password && (
              <p id="password-error" className="ui-error-text" role="alert">{errors.password.message}</p>
            )}
          </div>

          <label className="ui-inline-check ui-auth-remember">
            <input
              type="checkbox"
              checked={rememberNumber}
              onChange={(event) => setRememberNumber(event.target.checked)}
              disabled={loading}
            />
            <span>{t('login.rememberNumber')}</span>
          </label>

          {serverError && (
            <p className="ui-auth-notice ui-auth-notice--danger" role="alert">{serverError}</p>
          )}

          <button type="submit" disabled={loading} aria-busy={loading || undefined} className="ui-btn ui-btn-primary ui-auth-submit">
            {loading && <Spinner />}
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>
      </AuthCard>
    </AuthScreen>
  )
}
