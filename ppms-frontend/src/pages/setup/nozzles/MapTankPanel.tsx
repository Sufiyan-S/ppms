import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { TankInfo } from '../../../api/pumpApi'
import type { NozzleDetail } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Spinner } from '../../../components/Spinner'
import { useToastStore } from '../../../store/toastStore'
import { FUEL_LABELS } from '../../../constants/fuel'
import { useInvalidateNozzles } from './nozzlePanels'

interface Props {
  pumpId: number
  duId: number
  nozzle: NozzleDetail
  tanks: TankInfo[]
  onClose: () => void
}

export function MapTankPanel({ pumpId, duId, nozzle, tanks, onClose }: Props) {
  const { addToast } = useToastStore()
  const invalidate = useInvalidateNozzles(pumpId)
  const [tankSelection, setTankSelection] = useState<number | null>(nozzle.tankId ?? null)
  const [mapError, setMapError] = useState<string | null>(null)

  const mapTankMutation = useMutation({
    mutationFn: ({ pumpId, duId, nozzleId, tankId }: { pumpId: number; duId: number; nozzleId: number; tankId: number | null }) =>
      pumpApi.mapNozzleToTank(pumpId, duId, nozzleId, tankId),
    onSuccess: () => { onClose(); addToast('Tank mapped successfully', 'success'); invalidate() },
    onError: (err) => { const msg = parseApiError(err, 'Failed to save tank mapping'); setMapError(msg); addToast(msg, 'error') },
  })

  const compatibleTanks = tanks.filter(
    (t) => t.fuelType === nozzle.fuelType && t.status === 'ACTIVE'
  )

  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <div className="ui-tank-map-form">
        <div className="ui-tank-map-form__hero">
          <div>
            <p className="ui-section-kicker mb-2">Tank Mapping</p>
            <h3 className="ui-title-sm">Map nozzle to tank</h3>
            <p className="ui-subtitle mt-1">
              Assign nozzle #{nozzle.nozzleNumber} ({FUEL_LABELS[nozzle.fuelType]}) to the tank it draws from.
            </p>
          </div>
        </div>
        <SearchableSelect label="Map to tank"
          value={tankSelection != null ? tankSelection.toString() : ''}
          onChange={(v) => setTankSelection(v === '' ? null : Number(v))}
          placeholder="— unmap —"
          size="sm"
          options={compatibleTanks.map((t) => ({ value: t.id.toString(), label: t.tankIdentifier }))}
        />
        {compatibleTanks.length === 0 && (
          <p className="text-xs text-amber-600 mt-1">
            No active {FUEL_LABELS[nozzle.fuelType]} tanks available.
          </p>
        )}
        {mapError && <p role="alert" className="ui-error-text">{mapError}</p>}
        <div className="ui-tank-map-form__actions">
          <button
            type="button"
            onClick={() => mapTankMutation.mutate({ pumpId, duId, nozzleId: nozzle.id, tankId: tankSelection })}
            disabled={mapTankMutation.isPending}
            className="ui-btn ui-btn-primary"
          >
            {mapTankMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner className="w-3 h-3" />Saving…</span> : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
