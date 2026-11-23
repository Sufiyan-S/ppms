import { useEffect, useId, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { FuelType, DUOption } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { useToastStore } from '../../../store/toastStore'
import { FormField } from '../../../components/FormField'
import { LoadingButton } from '../../../components/LoadingButton'
import { NumericInput } from '../../../components/NumericInput'
import { StillNeeded } from '../../../components/StillNeeded'
import { FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { ALL_FUEL_TYPES } from '../fuelStyles'
import { useInvalidateNozzles } from './nozzlePanels'

interface Props {
  pumpId: number
  du: DUOption
  onClose: () => void
}

export function AddNozzleForm({ pumpId, du, onClose }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const invalidate = useInvalidateNozzles(pumpId)
  const formId = useId()
  const stillNeededId = `${formId}-still-needed`
  const numberRef = useRef<HTMLInputElement>(null)
  const [inlineNozzleNumber, setInlineNozzleNumber] = useState(String(du.nozzles.length + 1))
  const [inlineFuelType, setInlineFuelType] = useState<FuelType | ''>('')
  const [inlineReading, setInlineReading] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)

  useEffect(() => { numberRef.current?.focus() }, [])

  const addNozzleMutation = useMutation({
    mutationFn: ({ duId, nozzleNumber, fuelType, initialReading }: { duId: number; nozzleNumber: number; fuelType: FuelType; initialReading?: number }) =>
      pumpApi.addNozzle(pumpId, duId, nozzleNumber, fuelType, initialReading),
    onSuccess: () => {
      onClose()
      addToast(t('nozzles.add.added'), 'success')
      invalidate()
    },
    onError: (err) => { const msg = parseApiError(err, t('nozzles.add.failed')); setInlineError(msg); addToast(msg, 'error') },
  })

  const stillNeeded = [
    ...(!inlineNozzleNumber ? [t('nozzles.nozzleNumber')] : []),
    ...(!inlineFuelType ? [t('tanks.fuelType')] : []),
  ]

  const submitInlineNozzle = (e: React.FormEvent) => {
    e.preventDefault(); setInlineError(null)
    if (!inlineFuelType) { setInlineError(t('nozzles.add.selectFuel')); return }
    if (!inlineNozzleNumber) { setInlineError(t('nozzles.add.enterNumber')); return }
    addNozzleMutation.mutate({
      duId: du.id,
      nozzleNumber: Number(inlineNozzleNumber),
      fuelType: inlineFuelType as FuelType,
      initialReading: inlineReading ? Number(inlineReading) : undefined,
    })
  }

  return (
    <div className="px-4 py-3 border-t border-border bg-surface-sunken rounded-b-card">
      <form onSubmit={submitInlineNozzle} aria-label={t('nozzles.du.addNozzle')} className="space-y-3">
        <div className="flex items-end gap-2 flex-wrap">
          <FormField className="w-24" label={t('nozzles.nozzleNumber')}>
            <NumericInput
              ref={numberRef}
              inputMode="numeric"
              min="1" max="9"
              value={inlineNozzleNumber}
              onChange={(e) => setInlineNozzleNumber(e.target.value)}
            />
          </FormField>
          <div className="flex-1 min-w-40">
            <span id={`${formId}-fuel`} className="ui-label">{t('tanks.fuelType')}</span>
            <SearchableSelect aria-labelledby={`${formId}-fuel`}
              value={inlineFuelType}
              onChange={(v) => setInlineFuelType(v as FuelType)}
              placeholder={t('nozzles.selectPlaceholder')}
              options={ALL_FUEL_TYPES.map((ft) => ({ value: ft, label: codeLabel(ft) }))}
            />
          </div>
          <FormField className="w-40" label={t('nozzles.startReading')}>
            <NumericInput
              step="0.001" min="0"
              unit={inlineFuelType ? FUEL_UNIT[inlineFuelType] ?? 'L' : 'L'}
              value={inlineReading}
              onChange={(e) => setInlineReading(e.target.value)}
              placeholder="0"
            />
          </FormField>
        </div>
        {inlineError && <p role="alert" className="ui-error-text">{inlineError}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <LoadingButton
            type="submit"
            isLoading={addNozzleMutation.isPending}
            loadingLabel={t('actions.adding')}
            disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn-primary"
          >
            {t('nozzles.du.addNozzle')}
          </LoadingButton>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
          <StillNeeded id={stillNeededId} items={stillNeeded} />
        </div>
      </form>
    </div>
  )
}
