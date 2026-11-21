import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { pumpApi } from '../../../api/pumpApi'
import type { FuelType, DUOption } from '../../../types/shift'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Spinner } from '../../../components/Spinner'
import { useToastStore } from '../../../store/toastStore'
import { FUEL_LABELS } from '../../../constants/fuel'
import { ALL_FUEL_TYPES } from '../fuelStyles'
import { useInvalidateNozzles } from './nozzlePanels'

interface Props {
  pumpId: number
  du: DUOption
  onClose: () => void
}

export function AddNozzleForm({ pumpId, du, onClose }: Props) {
  const { addToast } = useToastStore()
  const invalidate = useInvalidateNozzles(pumpId)
  const [inlineNozzleNumber, setInlineNozzleNumber] = useState(String(du.nozzles.length + 1))
  const [inlineFuelType, setInlineFuelType] = useState<FuelType | ''>('')
  const [inlineReading, setInlineReading] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)

  const addNozzleMutation = useMutation({
    mutationFn: ({ duId, nozzleNumber, fuelType, initialReading }: { duId: number; nozzleNumber: number; fuelType: FuelType; initialReading?: number }) =>
      pumpApi.addNozzle(pumpId, duId, nozzleNumber, fuelType, initialReading),
    onSuccess: () => {
      onClose()
      addToast('Nozzle added', 'success')
      invalidate()
    },
    onError: (err) => { const msg = parseApiError(err, 'Failed to add nozzle'); setInlineError(msg); addToast(msg, 'error') },
  })

  const submitInlineNozzle = (e: React.FormEvent) => {
    e.preventDefault(); setInlineError(null)
    if (!inlineFuelType) { setInlineError('Select a fuel type.'); return }
    if (!inlineNozzleNumber) { setInlineError('Enter a nozzle number.'); return }
    addNozzleMutation.mutate({
      duId: du.id,
      nozzleNumber: Number(inlineNozzleNumber),
      fuelType: inlineFuelType as FuelType,
      initialReading: inlineReading ? Number(inlineReading) : undefined,
    })
  }

  return (
    <div className="px-4 py-3 border-t border-blue-100 bg-blue-50/40 rounded-b-xl">
      <form onSubmit={submitInlineNozzle} className="flex items-end gap-2 flex-wrap">
        <div className="w-20">
          <label className="block">
            <span className="ui-label mb-1 text-[10px]">Nozzle #</span>
            <input
              type="number" min="1" max="9"
              value={inlineNozzleNumber}
              onChange={(e) => setInlineNozzleNumber(e.target.value)}
              className="text-xs w-full"
              placeholder="1"
            />
          </label>
        </div>
        <div className="flex-1 min-w-[160px]">
          <span className="ui-label mb-1 text-[10px]">Fuel Type</span>
          <SearchableSelect label="Fuel Type"
            value={inlineFuelType}
            onChange={(v) => setInlineFuelType(v as FuelType)}
            placeholder="— select —"
            size="sm"
            options={ALL_FUEL_TYPES.map((ft) => ({ value: ft, label: FUEL_LABELS[ft] }))}
          />
        </div>
        <div className="w-32">
          <label className="block">
            <span className="ui-label mb-1 text-[10px]">Start Reading</span>
            <input
              type="number" step="0.001" min="0"
              value={inlineReading}
              onChange={(e) => setInlineReading(e.target.value)}
              placeholder="0"
              className="text-xs w-full"
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={addNozzleMutation.isPending}
            className="ui-btn ui-btn-primary min-h-0 px-3 py-1.5 text-xs"
          >
            {addNozzleMutation.isPending ? <span className="flex items-center gap-1"><Spinner className="w-3 h-3" />Adding…</span> : 'Add'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-ghost min-h-0 px-3 py-1.5 text-xs text-slate-500"
          >
            Cancel
          </button>
        </div>
      </form>
      {inlineError && <p role="alert" className="ui-error-text mt-2">{inlineError}</p>}
    </div>
  )
}
