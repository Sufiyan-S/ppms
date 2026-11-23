import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'
import { FormField } from '../../components/FormField'
import { LoadingButton } from '../../components/LoadingButton'
import { NumericInput } from '../../components/NumericInput'
import { formatCurrency } from '../../utils/format'

// ── Pump Settings Content ─────────────────────────────────────────────────────

export function PumpSettingsContent({ pump, onUpdated }: { pump: PumpSummary; onUpdated: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const [threshold, setThreshold] = useState(pump.discrepancyEscalationThreshold?.toString() ?? '')
  const [error, setError]         = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (val: number | null) =>
      pumpApi.updatePumpSettings(pump.id, { discrepancyEscalationThreshold: val }),
    onSuccess: () => {
      addToast(t('settings.saved'), 'success')
      setError(null)
      onUpdated()
    },
    onError: (err) => setError(parseApiError(err, t('settings.saveFailed'))),
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    const val = threshold.trim()
    if (val === '') {
      mutation.mutate(null)
      return
    }
    const num = parseFloat(val)
    if (isNaN(num) || num < 0) {
      setError(t('settings.invalidAmount'))
      return
    }
    mutation.mutate(num)
  }

  const typedLimit = Number(threshold)
  const effect = threshold.trim() === ''
    ? t('settings.effectOff')
    : Number.isFinite(typedLimit) && typedLimit >= 0
    ? t('settings.effectOn', { amount: formatCurrency(typedLimit) })
    : null

  return (
    <form onSubmit={handleSave} className="space-y-4 pt-2">
      <p className="text-xs text-ink-3">{t('settings.explanation')}</p>

      <FormField
        className="max-w-xs"
        label={<>{t('settings.thresholdLabel')} <span className="text-ink-3 font-normal">{t('common:fields.optionalSuffix')}</span></>}
        help={effect ?? undefined}
        error={error ?? undefined}
      >
        <NumericInput min="0" step="1" unit="₹" value={threshold}
          onChange={(e) => { setThreshold(e.target.value); setError(null) }} />
      </FormField>

      <LoadingButton type="submit" isLoading={mutation.isPending} loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
        {t('settings.save')}
      </LoadingButton>
    </form>
  )
}
