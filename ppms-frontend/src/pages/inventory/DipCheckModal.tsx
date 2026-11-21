import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { inventoryApi } from '../../api/inventoryApi'
import { userApi } from '../../api/userApi'
import type { TankStock } from '../../api/inventoryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { FUEL_COLORS } from './inventoryFormat'
import { IconButton } from '../../components/IconButton'

// ── DIP Check Modal ────────────────────────────────────────────────────────────

export function DipCheckModal({
  pumpId,
  tank,
  onClose,
}: {
  pumpId: number
  tank: TankStock
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const cols = FUEL_COLORS[tank.fuelType] ?? FUEL_COLORS.PETROL

  const [measured,        setMeasured]        = useState('')
  const [date,            setDate]            = useState(localDateInputValue())
  const [checkedByUserId, setCheckedByUserId] = useState<string>('')
  const [notes,           setNotes]           = useState('')
  const [error,           setError]           = useState<string | null>(null)

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pumpId],
    queryFn:  () => userApi.getStaff(pumpId),
  })

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.recordDipCheck(pumpId, {
        tankId:           tank.tankId,
        measuredQuantity: Number(measured),
        checkedAt:        date,
        checkedByUserId:  checkedByUserId ? Number(checkedByUserId) : undefined,
        notes:            notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['dipChecks', pumpId] })
      onClose()
    },
    onError: (err) =>
      setError(parseApiError(err, 'Failed to record DIP check')),
  })

  const variance = measured !== '' ? Number(measured) - tank.currentStock : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!measured || !date) { setError('Measured quantity and date are required.'); return }
    mutation.mutate()
  }

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-sm overflow-hidden">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--neutral">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">DIP Check</h2>
            <p className="ui-modal-subtitle">
              {tank.tankIdentifier} — <span className={cols.text.replace('text-', 'text-')}>{tank.fuelType}</span>
            </p>
          </div>
          <IconButton label="Close" icon="×" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close" />
        </div>

        <form onSubmit={handleSubmit} className="ui-modal-body space-y-4">
          {/* Current system stock */}
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-xs text-slate-500">
            System stock right now:{' '}
            <span className="font-bold text-slate-700">
              {tank.currentStock.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
            </span>
          </div>

          {/* Measured quantity */}
          <div>
            <label className="block">
              <span className="ui-label">
              Dipstick Reading (Litres)
            </span>
              <input
                required
                type="number"
                step="0.001"
                min="0"
                value={measured}
                onChange={e => setMeasured(e.target.value)}
                placeholder="Physically measured quantity"
                className="text-sm"
                data-autofocus
              />
            </label>
          </div>

          {/* Live variance preview */}
          {variance !== null && (
            <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center justify-between ${
              Math.abs(variance) < tank.dipTolerance
                ? 'bg-emerald-50 text-emerald-700'
                : variance > 0
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700'
            }`}>
              <span>
                {Math.abs(variance) < tank.dipTolerance
                  ? <span className="inline-flex items-center gap-1">Within tolerance<Check size={12} strokeWidth={2.5} /></span>
                  : variance > 0
                    ? 'Surplus detected'
                    : 'Shortage detected'}
              </span>
              <span className="font-bold">
                {variance > 0 ? '+' : ''}{variance.toFixed(1)} L variance
              </span>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block">
              <span className="ui-label">Check Date</span>
              <input
                required
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="text-sm"
              />
            </label>
          </div>

          {/* Operator */}
          <div>
            <span className="ui-label">
              Checked By <span className="text-slate-500">(optional)</span>
            </span>
            <SearchableSelect label="Checked By"
              value={checkedByUserId}
              onChange={v => setCheckedByUserId(v)}
              placeholder="— Select operator —"
              options={staff.map(s => ({
                value: String(s.id),
                label: `${s.fullName} (${s.role.charAt(0) + s.role.slice(1).toLowerCase()})`,
              }))}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block">
              <span className="ui-label">
              Notes <span className="text-slate-500">(optional)</span>
            </span>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Reading taken at 6pm"
                className="text-sm"
              />
            </label>
          </div>

          {error && <p role="alert" className="ui-error-text">{error}</p>}

          <div className="ui-modal-footer -mx-6 -mb-6">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="ui-btn ui-btn-primary flex-1 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400"
            >
              {mutation.isPending ? 'Saving...' : 'Save DIP Check'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}
