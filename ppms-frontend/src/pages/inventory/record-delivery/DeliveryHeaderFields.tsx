import { Truck } from 'lucide-react'
import type { Tanker } from '../../../api/tankerApi'
import { SearchableSelect } from '../../../components/SearchableSelect'

interface Props {
  date: string
  setDate: (value: string) => void
  invoice: string
  setInvoice: (value: string) => void
  tankers: Tanker[]
  selectedTanker: Tanker | null
  selectedTankerId: number | null
  setSelectedTankerId: (id: number | null) => void
  tankerMismatch: boolean
  tankerRemaining: number | null
  totalEnteredQty: number
}

export function DeliveryHeaderFields({ date, setDate, invoice, setInvoice, tankers, selectedTanker, selectedTankerId, setSelectedTankerId, tankerMismatch, tankerRemaining, totalEnteredQty }: Props) {
  return (
    <div className="ui-modal-body border-b border-slate-100 flex-shrink-0">
      <div className="ui-inline-form">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block">
            <span className="ui-label">
            Delivery Date <span className="text-red-500">*</span>
          </span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="shadow-sm"
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className="ui-label">
            Invoice / Bill No. <span className="text-red-500">*</span>
          </span>
            <input
              type="text"
              value={invoice}
              onChange={e => setInvoice(e.target.value)}
              placeholder="e.g. INV-2026-0042"
              className="shadow-sm"
            />
          </label>
        </div>
      </div>

      {tankers.length > 0 && (
        <div className="mt-3">
          <span className="ui-label">Tanker (Truck)</span>
          <SearchableSelect label="Tanker (Truck)"
            value={selectedTankerId !== null ? String(selectedTankerId) : ''}
            onChange={v => setSelectedTankerId(v ? Number(v) : null)}
            options={[
              { value: '', label: '— No tanker selected —' },
              ...tankers.map(t => ({
                value: String(t.id),
                label: `${t.name} · ${t.capacityLitres.toLocaleString('en-IN')} L${t.defaultTanker ? ' (Default)' : ''}`,
              })),
            ]}
            placeholder="Select tanker…"
          />
          {selectedTanker && (
            <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              tankerMismatch
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            }`}>
              <Truck size={12} strokeWidth={2} className="shrink-0" />
              <span>
                Capacity: <span className="font-semibold">{selectedTanker.capacityLitres.toLocaleString('en-IN')} L</span>
                {' · '}
                Entered: <span className="font-semibold">{totalEnteredQty.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L</span>
                {tankerRemaining !== null && tankerRemaining !== 0 && (
                  <span className="ml-1">
                    · <span className="font-semibold">{tankerRemaining > 0 ? `${tankerRemaining.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L remaining` : `${Math.abs(tankerRemaining).toLocaleString('en-IN', { minimumFractionDigits: 1 })} L over`}</span>
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
