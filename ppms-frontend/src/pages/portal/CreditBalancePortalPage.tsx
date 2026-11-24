import { useState } from 'react'
import axios, { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { FormField } from '../../components/FormField'
import { PasswordInput } from '../../components/PasswordInput'
import { PORTAL_PIN_PATTERN, digitsOnly } from '../../constants/portalPin'
import { MoneyText } from '../../components/AmountText'
import { NumericInput } from '../../components/NumericInput'
import { LoadingButton } from '../../components/LoadingButton'
import { AuthCard, AuthScreen } from '../auth/AuthCard'

// Uses a plain axios instance — no auth header, no JWT
const publicClient = axios.create({ baseURL: '/api' })

interface BalanceResult {
  outstandingAmount: number
  creditLimit: number
}

type PortalError = 'incomplete' | 'noMatch' | 'tooManyAttempts' | 'lookupFailed'

function lookupError(err: unknown): PortalError {
  const status = isAxiosError(err) ? err.response?.status : undefined
  if (status === 429) return 'tooManyAttempts'
  if (status === 404 || status === 400) return 'noMatch'
  return 'lookupFailed'
}

export default function CreditBalancePortalPage() {
  const { t } = useTranslation('portal')
  const [pumpId, setPumpId]   = useState('')
  const [phone, setPhone]     = useState('')
  const [pin, setPin]         = useState('')
  const [result, setResult]   = useState<BalanceResult | null>(null)
  const [error, setError]     = useState<PortalError | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pumpId.trim() || !/^\d{10}$/.test(phone) || !PORTAL_PIN_PATTERN.test(pin)) {
      setError('incomplete')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await publicClient.post<BalanceResult>('/public/credit-balance', {
        pumpId: parseInt(pumpId), phone, pin,
      })
      setResult(res.data)
    } catch (err) {
      setError(lookupError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScreen brandMessage={{ tagline: t('brand.tagline'), supportingLine: t('brand.supportingLine') }}>
      <AuthCard
        title={t('title')}
        description={t('subtitle')}
        footer={<p className="text-xs text-ink-3">{t('footer')}</p>}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <FormField label={t('form.pumpId')} help={t('form.pumpIdHelp')}>
            <NumericInput min="1" step="1" inputMode="numeric" value={pumpId}
              onChange={e => setPumpId(e.target.value)} required />
          </FormField>

          <FormField label={t('form.phone')} help={t('form.phoneHelp')}>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={e => setPhone(digitsOnly(e.target.value).slice(0, 10))}
              required
            />
          </FormField>

          <FormField label={t('form.pin')} help={t('form.pinHelp')}>
            <PasswordInput
              toggleLabel={t('form.showPin')}
              value={pin}
              onChange={e => setPin(digitsOnly(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              required
            />
          </FormField>

          {error && (
            <p role="alert" className="ui-alert ui-alert-danger">{t(`errors.${error}`)}</p>
          )}

          <LoadingButton type="submit" isLoading={loading} loadingLabel={t('form.checking')} className="ui-btn-primary w-full">
            {t('form.check')}
          </LoadingButton>
        </form>

        {result && (
          <div role="status" className="ui-card-plain ui-card-muted px-4 py-4">
            <p className="text-xs text-ink-3 mb-3">{t('result.account')}</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-3">{t('result.outstanding')}</span>
                <MoneyText value={result.outstandingAmount} className="text-sm font-bold text-ink" />
              </div>
              {result.creditLimit > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-3">{t('result.creditLimit')}</span>
                  <MoneyText value={result.creditLimit} className="text-sm text-ink" />
                </div>
              )}
            </div>

            {result.outstandingAmount <= 0 && (
              <p className="text-xs text-ok font-medium mt-2">{t('result.settled')}</p>
            )}
          </div>
        )}

      </AuthCard>
    </AuthScreen>
  )
}
