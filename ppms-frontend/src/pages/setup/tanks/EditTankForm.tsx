import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../../api/pumpApi'
import type { TankInfo, UpdateTankRequest } from '../../../api/pumpApi'
import { parseApiError } from '../../../utils/apiError'
import { FormField } from '../../../components/FormField'
import { FormGrid } from '../../../components/layout/FormGrid'
import { LoadingButton } from '../../../components/LoadingButton'
import { NumericInput } from '../../../components/NumericInput'
import { typedQuantity, useInvalidateTanks } from './tankFormat'

interface EditTankFormProps {
  pumpId: number
  tank: TankInfo
  unit: string
  onClose: () => void
}

export function EditTankForm({ pumpId, tank, unit, onClose }: EditTankFormProps) {
  const { t } = useTranslation(['setup', 'common'])
  const invalidateTanks = useInvalidateTanks(pumpId)
  const [identifier, setIdentifier] = useState(tank.tankIdentifier)
  const [capacity, setCapacity] = useState(String(tank.capacity))
  const [error, setError] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: (req: UpdateTankRequest) => pumpApi.updateTank(pumpId, tank.id, req),
    onSuccess: () => { setError(null); invalidateTanks(); onClose() },
    onError: (err) => setError(parseApiError(err, t('tanks.updateFailed'))),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null)
    if (!capacity || Number(capacity) <= 0) { setError(t('tanks.capacityPositive')); return }
    updateMutation.mutate({ capacity: Number(capacity), tankIdentifier: identifier.trim() || undefined })
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-3">
      <FormGrid>
        <FormField label={t('tanks.nameLabel')}>
          <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="text-sm" />
        </FormField>
        <FormField label={t('tanks.capacity')} help={typedQuantity(capacity, unit) ?? undefined} error={error ?? undefined}>
          <NumericInput step="0.01" min="1" unit={unit} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </FormField>
      </FormGrid>
      <div className="flex flex-wrap gap-2">
        <LoadingButton type="submit" isLoading={updateMutation.isPending} loadingLabel={t('common:actions.saving')} className="ui-btn-primary">
          {t('tanks.saveTank')}
        </LoadingButton>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
          {t('common:actions.cancel')}
        </button>
      </div>
    </form>
  )
}
