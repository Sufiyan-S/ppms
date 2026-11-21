import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { parseApiError } from '../../../utils/apiError'
import { dipApi } from '../../../api/dipApi'
import type { FuelPrice } from '../../../api/pumpApi'
import type { NozzleDetail } from '../../../types/shift'
import { Spinner } from '../../../components/Spinner'
import { useToastStore } from '../../../store/toastStore'
import { FUEL_LABELS } from '../../../constants/fuel'
import { FUEL_COLOR } from '../fuelStyles'
import { useInvalidateNozzles } from './nozzlePanels'

interface Props {
  pumpId: number
  nozzle: NozzleDetail
  currentPrices: FuelPrice[]
  onClose: () => void
}

export function RecordDipPanel({ pumpId, nozzle, currentPrices, onClose }: Props) {
  const { addToast } = useToastStore()
  const invalidate = useInvalidateNozzles(pumpId)
  const [dipLitres, setDipLitres] = useState('')
  const [dipDate, setDipDate] = useState('')
  const [dipReason, setDipReason] = useState('')
  const [dipError, setDipError] = useState<string | null>(null)

  const recordDipMutation = useMutation({
    mutationFn: ({ fuelType, litresRemoved, reason, date }: { fuelType: string; litresRemoved: number; reason: string; date?: string }) =>
      dipApi.recordDip(pumpId, fuelType, litresRemoved, reason, date),
    onSuccess: () => { onClose(); addToast('Dip recorded', 'success'); invalidate() },
    onError: (err) => { const msg = parseApiError(err, 'Failed to record dip'); setDipError(msg); addToast(msg, 'error') },
  })

  const submitDip = (e: React.FormEvent) => {
    e.preventDefault(); setDipError(null)
    if (!dipLitres || Number(dipLitres) <= 0) { setDipError('Enter a valid litres amount.'); return }
    if (!dipReason.trim()) { setDipError('Please provide a reason.'); return }
    recordDipMutation.mutate({
      fuelType: nozzle.fuelType,
      litresRemoved: Number(dipLitres),
      reason: dipReason,
      date: dipDate || undefined,
    })
  }

  const priceEntry = currentPrices.find((p) => p.fuelType === nozzle.fuelType)
  const pricePerUnit = priceEntry?.pricePerUnit ?? 0
  const estimatedLoss = dipLitres && Number(dipLitres) > 0 && pricePerUnit > 0
    ? Number(dipLitres) * pricePerUnit
    : null

  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <form onSubmit={submitDip} className="ui-dip-editor">
        <div className="ui-dip-editor__hero">
          <div>
            <p className="ui-section-kicker mb-2">Dip Record</p>
            <h3 className="ui-title-sm">Record fuel dip</h3>
            <p className="ui-subtitle mt-1">
              Record fuel physically removed from the tank, such as maintenance draining or contamination removal.
            </p>
          </div>
          <div className="ui-dip-editor__meta">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${FUEL_COLOR[nozzle.fuelType] ?? ''}`}>
              {FUEL_LABELS[nozzle.fuelType]}
            </span>
          </div>
        </div>
        <div className="ui-dip-editor__section">
          <label className="block">
            <span className="ui-label">Litres Removed</span>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={dipLitres}
              onChange={(e) => setDipLitres(e.target.value)}
              placeholder="e.g. 12.500"
              className="text-xs min-h-10"
            />
          </label>
          {estimatedLoss !== null && (
            <p className="ui-dip-editor__loss">
              Estimated loss: ₹{estimatedLoss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {` @ ₹${pricePerUnit}/unit`}
            </p>
          )}
        </div>
        <div className="ui-dip-editor__grid">
          <div className="ui-dip-editor__section">
            <label className="block">
              <span className="ui-label">
              Date <span className="text-slate-500">(leave blank for today)</span>
            </span>
              <input
                type="date"
                value={dipDate}
                onChange={(e) => setDipDate(e.target.value)}
                className="text-xs min-h-10"
              />
            </label>
          </div>
          <div className="ui-dip-editor__section">
            <label className="block">
              <span className="ui-label">Reason <span className="text-red-500">*</span></span>
              <input
                type="text"
                value={dipReason}
                onChange={(e) => setDipReason(e.target.value)}
                placeholder="e.g. Water contamination draining"
                className="text-xs min-h-10"
              />
            </label>
          </div>
        </div>
        {dipError && <p role="alert" className="ui-error-text">{dipError}</p>}
        <div className="ui-dip-editor__actions">
          <button
            type="submit"
            disabled={recordDipMutation.isPending}
            className="ui-btn ui-btn-warning"
          >
            {recordDipMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner className="w-3 h-3" />Recording…</span> : 'Record Dip'}
          </button>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">
            Cancel
          </button>
        </div>
      </form>    </div>
  )
}
