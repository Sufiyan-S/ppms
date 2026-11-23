import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { FuelType } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { useToastStore } from '../../../store/toastStore'
import { IconButton } from '../../../components/IconButton'
import { FormField } from '../../../components/FormField'
import { LoadingButton } from '../../../components/LoadingButton'
import { NumericInput } from '../../../components/NumericInput'
import { StillNeeded } from '../../../components/StillNeeded'
import { FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { ALL_FUEL_TYPES } from '../fuelStyles'

export function CreateDuForm({ pumpId, onCreated }: { pumpId: number; onCreated: () => void }) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const formId = useId()
  const stillNeededId = `${formId}-still-needed`
  const [duName, setDuName] = useState('')
  const [duNozzles, setDuNozzles] = useState<Array<{ nozzleNumber: string; fuelType: FuelType | ''; initialReading: string }>>([
    { nozzleNumber: '1', fuelType: '', initialReading: '' },
  ])
  const [addError, setAddError] = useState<string | null>(null)

  const createDUMutation = useMutation({
    mutationFn: (req: { name: string; nozzles: Array<{ nozzleNumber: number; fuelType: FuelType; initialReading?: number }> }) =>
      pumpApi.createDU(pumpId, req),
    onSuccess: () => {
      setDuName('')
      setDuNozzles([{ nozzleNumber: '1', fuelType: '', initialReading: '' }])
      setAddError(null)
      addToast(t('nozzles.createDu.created'), 'success')
      onCreated()
    },
    onError: (err) => {
      const msg = parseApiError(err, t('nozzles.createDu.failed'))
      setAddError(msg)
      addToast(msg, 'error')
    },
  })

  const validNozzles = duNozzles.filter((n) => n.nozzleNumber && n.fuelType)
  const stillNeeded = [
    ...(duName.trim() === '' ? [t('nozzles.createDu.name')] : []),
    ...(validNozzles.length === 0 ? [t('nozzles.createDu.stillNeededNozzle')] : []),
  ]

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault(); setAddError(null)
    if (!duName.trim()) { setAddError(t('nozzles.createDu.nameRequired')); return }
    if (validNozzles.length === 0) { setAddError(t('nozzles.createDu.nozzleRequired')); return }
    createDUMutation.mutate({
      name: duName.trim(),
      nozzles: validNozzles.map((n) => ({
        nozzleNumber: Number(n.nozzleNumber),
        fuelType: n.fuelType as FuelType,
        initialReading: n.initialReading ? Number(n.initialReading) : undefined,
      })),
    })
  }

  const updateNozzle = (idx: number, change: Partial<(typeof duNozzles)[number]>) =>
    setDuNozzles((prev) => prev.map((r, i) => i === idx ? { ...r, ...change } : r))

  return (
    <form onSubmit={submitAdd} aria-labelledby={`${formId}-title`} className="ui-nozzle-form">
      <div className="ui-nozzle-form__hero">
        <div>
          <h3 id={`${formId}-title`} className="ui-title-sm">{t('nozzles.createDu.title')}</h3>
          <p className="ui-subtitle mt-1">{t('nozzles.createDu.subtitle')}</p>
        </div>
      </div>

      <div className="ui-nozzle-form__section">
        <FormField label={t('nozzles.createDu.name')}>
          <input
            required
            type="text"
            value={duName}
            onChange={(e) => setDuName(e.target.value)}
            placeholder={t('nozzles.createDu.namePlaceholder')}
            className="text-sm"
          />
        </FormField>
      </div>

      <div className="ui-nozzle-form__section">
        <div className="ui-nozzle-form__section-head">
          <div>
            <h4 className="text-sm font-semibold text-ink">{t('nozzles.createDu.nozzles')}</h4>
            <p className="ui-help mt-0">{t('nozzles.createDu.nozzlesHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => setDuNozzles((prev) => [...prev, { nozzleNumber: String(prev.length + 1), fuelType: '', initialReading: '' }])}
            className="ui-btn ui-btn-ghost ui-btn-compact"
          >
            {t('nozzles.createDu.addNozzle')}
          </button>
        </div>

        <div className="space-y-3 mt-2">
          {duNozzles.map((row, idx) => {
            const fuelLabelId = `${formId}-fuel-${idx}`
            return (
              <div key={idx} className="flex items-end gap-2 flex-wrap">
                <FormField className="w-24" label={t('nozzles.nozzleNumber')}>
                  <NumericInput
                    inputMode="numeric"
                    min="1"
                    max="20"
                    value={row.nozzleNumber}
                    onChange={(e) => updateNozzle(idx, { nozzleNumber: e.target.value })}
                  />
                </FormField>
                <div className="flex-1 min-w-40">
                  <span id={fuelLabelId} className="ui-label">{t('tanks.fuelType')}</span>
                  <SearchableSelect aria-labelledby={fuelLabelId}
                    value={row.fuelType}
                    onChange={(v) => updateNozzle(idx, { fuelType: v as FuelType })}
                    placeholder={t('nozzles.selectPlaceholder')}
                    options={ALL_FUEL_TYPES.map((ft) => ({ value: ft, label: codeLabel(ft) }))}
                  />
                </div>
                <FormField className="flex-1 min-w-40" label={t('nozzles.startReading')}>
                  <NumericInput
                    step="0.001"
                    min="0"
                    unit={row.fuelType ? FUEL_UNIT[row.fuelType] ?? 'L' : 'L'}
                    value={row.initialReading}
                    onChange={(e) => updateNozzle(idx, { initialReading: e.target.value })}
                    placeholder="0"
                  />
                </FormField>
                {duNozzles.length > 1 && (
                  <IconButton
                    onClick={() => setDuNozzles((prev) => prev.filter((_, i) => i !== idx))}
                    className="ui-btn ui-btn-ghost ui-btn-icon"
                    label={t('nozzles.createDu.removeNozzle')}
                    icon={<X size={14} strokeWidth={2} />}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {addError && <p role="alert" className="ui-error-text">{addError}</p>}

      <div className="ui-nozzle-form__actions flex-wrap items-center gap-3">
        <LoadingButton type="submit" isLoading={createDUMutation.isPending} loadingLabel={t('createPump.creating')}
          disabled={stillNeeded.length > 0}
          aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
          className="ui-btn-primary">
          {t('nozzles.createDu.submit')}
        </LoadingButton>
        <StillNeeded id={stillNeededId} items={stillNeeded} />
      </div>
    </form>
  )
}
