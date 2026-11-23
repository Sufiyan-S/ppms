import { useId, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { TankInfo } from '../../../api/pumpApi'
import type { NozzleDetail } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { LoadingButton } from '../../../components/LoadingButton'
import { useToastStore } from '../../../store/toastStore'
import { codeLabel } from '../../../constants/labels'
import { useInvalidateNozzles } from './nozzlePanels'

interface Props {
  pumpId: number
  duId: number
  nozzle: NozzleDetail
  tanks: TankInfo[]
  onClose: () => void
}

export function MapTankPanel({ pumpId, duId, nozzle, tanks, onClose }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const { addToast } = useToastStore()
  const invalidate = useInvalidateNozzles(pumpId)
  const panelId = useId()
  const [tankSelection, setTankSelection] = useState<number | null>(nozzle.tankId ?? null)
  const [mapError, setMapError] = useState<string | null>(null)

  const mapTankMutation = useMutation({
    mutationFn: ({ pumpId, duId, nozzleId, tankId }: { pumpId: number; duId: number; nozzleId: number; tankId: number | null }) =>
      pumpApi.mapNozzleToTank(pumpId, duId, nozzleId, tankId),
    onSuccess: () => { onClose(); addToast(t('nozzles.mapTank.mapped'), 'success'); invalidate() },
    onError: (err) => { const msg = parseApiError(err, t('nozzles.mapTank.failed')); setMapError(msg); addToast(msg, 'error') },
  })

  const compatibleTanks = tanks.filter(
    (tank) => tank.fuelType === nozzle.fuelType && tank.status === 'ACTIVE'
  )

  return (
    <div className="px-4 py-3 border-t border-border">
      <section aria-labelledby={`${panelId}-title`} className="ui-tank-map-form">
        <div className="ui-tank-map-form__hero">
          <div>
            <h3 id={`${panelId}-title`} className="ui-title-sm">{t('nozzles.mapTank.title')}</h3>
            <p className="ui-subtitle mt-1">
              {t('nozzles.mapTank.subtitle', { number: nozzle.nozzleNumber, fuel: codeLabel(nozzle.fuelType) })}
            </p>
          </div>
        </div>
        <div>
          <span id={`${panelId}-label`} className="ui-label">{t('nozzles.mapTank.selectLabel')}</span>
          <SearchableSelect aria-labelledby={`${panelId}-label`}
            value={tankSelection != null ? tankSelection.toString() : ''}
            onChange={(v) => setTankSelection(v === '' ? null : Number(v))}
            placeholder={t('nozzles.mapTank.unmap')}
            options={compatibleTanks.map((tank) => ({ value: tank.id.toString(), label: tank.tankIdentifier }))}
          />
          {compatibleTanks.length === 0 && (
            <p className="ui-help">
              {t('nozzles.mapTank.noTanks', { fuel: codeLabel(nozzle.fuelType) })}
            </p>
          )}
        </div>
        {mapError && <p role="alert" className="ui-error-text">{mapError}</p>}
        <div className="ui-tank-map-form__actions">
          <LoadingButton
            type="button"
            onClick={() => mapTankMutation.mutate({ pumpId, duId, nozzleId: nozzle.id, tankId: tankSelection })}
            isLoading={mapTankMutation.isPending}
            loadingLabel={t('common:actions.saving')}
            className="ui-btn-primary"
          >
            {t('nozzles.mapTank.save')}
          </LoadingButton>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            {t('common:actions.cancel')}
          </button>
        </div>
      </section>
    </div>
  )
}
