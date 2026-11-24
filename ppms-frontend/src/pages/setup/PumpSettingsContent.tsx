import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../utils/apiError'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'
import { FormField } from '../../components/FormField'
import { FormGrid } from '../../components/layout/FormGrid'
import { NumericInput } from '../../components/NumericInput'
import { formatCurrency } from '../../utils/format'
import { SetupFormGroup } from './SetupFormGroup'
import { SetupSaveBar } from './SetupSaveBar'

export function PumpSettingsContent({ pump, onUpdated }: { pump: PumpSummary; onUpdated: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const [savedThreshold, setSavedThreshold] = useState(pump.discrepancyEscalationThreshold?.toString() ?? '')
  const [threshold, setThreshold] = useState(savedThreshold)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (val: number | null) =>
      pumpApi.updatePumpSettings(pump.id, { discrepancyEscalationThreshold: val }),
    onSuccess: () => {
      addToast(t('settings.saved'), 'success')
      setError(null)
      setSavedThreshold(threshold)
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
      setFieldError(t('settings.invalidAmount'))
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
    <form onSubmit={handleSave} className="space-y-4">
      <SetupFormGroup icon={ShieldCheck} title={t('settings.escalationTitle')} hint={t('settings.explanation')}>
        <FormGrid>
          <FormField
            label={<>{t('settings.thresholdLabel')} <span className="text-ink-3 font-normal">{t('common:fields.optionalSuffix')}</span></>}
            help={effect ?? undefined}
            error={fieldError ?? undefined}
          >
            <NumericInput min="0" step="1" unit="₹" value={threshold}
              onChange={(e) => { setThreshold(e.target.value); setFieldError(null); setError(null) }} />
          </FormField>
        </FormGrid>
      </SetupFormGroup>

      <SetupSaveBar hasChanges={threshold.trim() !== savedThreshold.trim()} isSaving={mutation.isPending}
        saveLabel={t('settings.save')} error={error} />
    </form>
  )
}
