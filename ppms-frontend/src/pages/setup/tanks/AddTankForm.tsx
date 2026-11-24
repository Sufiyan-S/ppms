import { useId, useState } from 'react'
import type { Ref } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../../api/pumpApi'
import type { CreateTankRequest } from '../../../api/pumpApi'
import type { FuelType } from '../../../types/shift'
import { FUEL_UNIT } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { parseApiError } from '../../../utils/apiError'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { LoadingButton } from '../../../components/LoadingButton'
import { NumericInput } from '../../../components/NumericInput'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { StillNeeded } from '../../../components/StillNeeded'
import { ALL_FUEL_TYPES } from '../fuelStyles'
import { typedQuantity, useInvalidateTanks } from './tankFormat'

interface AddTankFormProps {
  pumpId: number
  isFirstTank: boolean
  nameInputRef?: Ref<HTMLInputElement>
}

export function AddTankForm({ pumpId, isFirstTank, nameInputRef }: AddTankFormProps) {
  const { t } = useTranslation(['setup', 'common'])
  const formId = useId()
  const invalidateTanks = useInvalidateTanks(pumpId)
  const [identifier, setIdentifier] = useState('')
  const [fuelType, setFuelType] = useState<FuelType>('PETROL')
  const [capacity, setCapacity] = useState('')
  const [dipTolerance, setDipTolerance] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (req: CreateTankRequest) => pumpApi.createTank(pumpId, req),
    onSuccess: () => {
      setIdentifier(''); setCapacity(''); setDipTolerance(''); setError(null)
      invalidateTanks()
    },
    onError: (err) => setError(parseApiError(err, t('tanks.createFailed'))),
  })

  const unit = FUEL_UNIT[fuelType] ?? 'L'
  const capacityText = typedQuantity(capacity, unit)
  const dipToleranceText = typedQuantity(dipTolerance, unit)
  const stillNeeded = [
    ...(identifier.trim() === '' ? [t('tanks.nameLabel')] : []),
    ...(capacityText === null ? [t('tanks.capacity')] : []),
  ]
  const stillNeededId = `${formId}-still-needed`

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    if (!identifier.trim()) { setError(t('tanks.nameRequired')); return }
    if (!capacity || Number(capacity) <= 0) { setError(t('tanks.capacityPositive')); return }
    createMutation.mutate({
      tankIdentifier: identifier.trim(),
      fuelType,
      capacity: Number(capacity),
      dipTolerance: dipTolerance ? Number(dipTolerance) : undefined,
    })
  }

  return (
    <section aria-labelledby={`${formId}-title`} className="ui-card-plain p-4">
      <h3 id={`${formId}-title`} className="mb-3 text-sm font-semibold text-ink">
        {isFirstTank ? t('tanks.addFirst') : t('tanks.addAnother')}
      </h3>
      <form onSubmit={submit} className="space-y-3">
        <FormGrid>
          <FormField label={t('tanks.nameLabel')}>
            <input ref={nameInputRef} required type="text" value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t('tanks.namePlaceholder')}
              className="text-sm" />
          </FormField>
          <div>
            <span id={`${formId}-fuel`} className="ui-label">{t('tanks.fuelType')}</span>
            <SearchableSelect aria-labelledby={`${formId}-fuel`}
              value={fuelType}
              onChange={(v) => setFuelType(v as FuelType)}
              options={ALL_FUEL_TYPES.map((ft) => ({ value: ft, label: codeLabel(ft) }))}
            />
          </div>
          <FormField label={t('tanks.capacity')}
            help={capacityText ? t('tanks.capacityHelp', { amount: capacityText }) : undefined}>
            <NumericInput required step="0.01" min="1" unit={unit} value={capacity}
              onChange={(e) => setCapacity(e.target.value)} />
          </FormField>
          <FormField
            label={<>{t('tanks.dipTolerance')} <span className="font-normal text-ink-3">{t('common:fields.optionalSuffix')}</span></>}
            help={dipToleranceText ? t('tanks.dipToleranceHelp', { amount: dipToleranceText }) : t('tanks.dipToleranceHint')}>
            <NumericInput step="0.01" min="0" unit={unit} value={dipTolerance}
              onChange={(e) => setDipTolerance(e.target.value)} />
          </FormField>
        </FormGrid>
        {error && <p role="alert" className="ui-error-text">{error}</p>}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <StillNeeded id={stillNeededId} items={stillNeeded} />
          <LoadingButton type="submit" isLoading={createMutation.isPending} loadingLabel={t('actions.adding')}
            disabled={stillNeeded.length > 0}
            aria-describedby={stillNeeded.length > 0 ? stillNeededId : undefined}
            className="ui-btn-primary">
            {t('tanks.add')}
          </LoadingButton>
        </div>
      </form>
    </section>
  )
}
