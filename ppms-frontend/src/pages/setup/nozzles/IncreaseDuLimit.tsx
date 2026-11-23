import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { PumpSummary } from '../../../api/pumpApi'
import { useToastStore } from '../../../store/toastStore'
import { FormField } from '../../../components/FormField'
import { LoadingButton } from '../../../components/LoadingButton'
import { NumericInput } from '../../../components/NumericInput'

export function IncreaseDuLimit({ pump, onUpdated }: { pump: PumpSummary; onUpdated: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const [showIncreaseMax, setShowIncreaseMax] = useState(false)
  const [newMaxCount, setNewMaxCount] = useState('')
  const [increaseError, setIncreaseError] = useState<string | null>(null)
  const limitRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (showIncreaseMax) limitRef.current?.focus()
  }, [showIncreaseMax])

  const increaseMaxMutation = useMutation({
    mutationFn: (count: number) => pumpApi.updateMaxDuCount(pump.id, count),
    onSuccess: () => {
      setShowIncreaseMax(false); setNewMaxCount(''); setIncreaseError(null)
      addToast(t('nozzles.limit.updated'), 'success')
      onUpdated()
    },
    onError: (err) => { const msg = parseApiError(err, t('nozzles.limit.failed')); setIncreaseError(msg); addToast(msg, 'error') },
  })

  const typedMax = Number(newMaxCount)
  const isRaise = newMaxCount !== '' && Number.isInteger(typedMax) && typedMax > pump.maxDuCount

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        {t('nozzles.limit.reached', { max: pump.maxDuCount })}
        {' '}{t('nozzles.limit.increaseHint')}
      </p>
      {!showIncreaseMax ? (
        <button
          type="button"
          onClick={() => { setShowIncreaseMax(true); setNewMaxCount(String(pump.maxDuCount + 1)) }}
          className="ui-btn ui-btn-secondary"
        >
          {t('nozzles.limit.increaseToggle')}
        </button>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); if (newMaxCount) increaseMaxMutation.mutate(Number(newMaxCount)) }}
          className="ui-inline-form space-y-3"
        >
          <FormField
            className="max-w-xs"
            label={t('nozzles.limit.newMax')}
            help={isRaise
              ? t('nozzles.limit.change', { current: pump.maxDuCount, next: typedMax })
              : t('nozzles.limit.current', { current: pump.maxDuCount })}
            error={increaseError ?? undefined}
          >
            <NumericInput
              ref={limitRef}
              inputMode="numeric"
              min={pump.maxDuCount + 1}
              max="20"
              value={newMaxCount}
              onChange={(e) => setNewMaxCount(e.target.value)}
            />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <LoadingButton
              type="submit"
              isLoading={increaseMaxMutation.isPending}
              loadingLabel={t('common:actions.saving')}
              disabled={!newMaxCount}
              className="ui-btn-primary"
            >
              {t('nozzles.limit.submit')}
            </LoadingButton>
            <button
              type="button"
              onClick={() => { setShowIncreaseMax(false); setIncreaseError(null) }}
              className="ui-btn ui-btn-secondary"
            >
              {t('common:actions.cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
