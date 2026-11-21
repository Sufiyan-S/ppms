import { X } from 'lucide-react'
import type { TankStock } from '../../../api/inventoryApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { IconButton } from '../../../components/IconButton'
import { limitDecimals } from '../inventoryFormat'
import type { DeliveryRow } from './deliveryRows'

interface Props {
  row: DeliveryRow
  rowNumber: number
  tanks: TankStock[]
  tankOptions: { value: string; label: string }[]
  isOwnerOrAdmin: boolean
  isExpanded: boolean
  onExpandedChange: (rowId: number | null) => void
  canRemove: boolean
  onRemove: () => void
  onChange: (field: keyof Omit<DeliveryRow, 'id'>, value: string) => void
}

export function DeliveryRowEditor({
  row, rowNumber, tanks, tankOptions, isOwnerOrAdmin, isExpanded, onExpandedChange, canRemove, onRemove, onChange,
}: Props) {
  const tank          = tanks.find(t => t.tankId === Number(row.tankId))
  const rowCost       = isOwnerOrAdmin ? (parseFloat(row.qty) || 0) * (parseFloat(row.costPrice) || 0) : 0
  const enteredQty    = parseFloat(row.qty) || 0
  const afterStock    = tank ? tank.currentStock + enteredQty : null
  const availableSpace = tank && tank.capacity > 0 ? tank.capacity - tank.currentStock : null
  const rowOverflow   = availableSpace !== null && enteredQty > 0 && enteredQty > availableSpace
    const isFilled      = !!row.tankId && enteredQty > 0 && (isOwnerOrAdmin ? parseFloat(row.costPrice) > 0 : true)

  return (
    <div key={row.id} className={`ui-card overflow-hidden ${rowOverflow ? 'border border-red-200 bg-red-50/40' : 'ui-card-muted'}`}>
      {/* ── Collapsed summary row ── */}
      {!isExpanded ? (
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-bold text-slate-500 shrink-0">#{rowNumber}</span>
            {isFilled ? (
              <>
                <span className="text-sm font-medium text-slate-700 truncate">
                  {tank?.tankIdentifier ?? '—'} · {tank?.fuelType ?? '—'}
                </span>
                <span className="text-xs text-slate-500 shrink-0">{enteredQty.toLocaleString('en-IN')} L</span>
                {rowOverflow && (
                  <span className="text-xs text-red-600 font-semibold shrink-0">Over capacity</span>
                )}
                {!rowOverflow && isOwnerOrAdmin && rowCost > 0 && (
                  <span className="text-sm font-semibold text-blue-700 shrink-0">
                    ₹{rowCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-500 italic">Incomplete — click Edit to fill</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              type="button"
              onClick={() => onExpandedChange(row.id)}
              className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
            >
              Edit
            </button>
            {canRemove && (
              <IconButton
                onClick={onRemove}
                className="text-red-300 hover:text-red-600 transition-colors"
                label="Remove row"
                icon={<X size={14} strokeWidth={2} />}
              />
            )}
          </div>
        </div>
      ) : (
        /* ── Expanded form ── */
        <div className="p-4 space-y-3">
          {/* Row header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Tank {rowNumber}
            </span>
            {canRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="ui-btn ui-btn-ghost min-h-8 px-0 py-0 text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Remove
              </button>
            )}
          </div>

          {/* Tank selector */}
          <div>
            <span className="ui-label">Tank</span>
            <SearchableSelect label="Tank"
              value={row.tankId}
              onChange={v => onChange('tankId', v)}
              options={tankOptions}
              placeholder="Select tank…"
            />
          </div>

          {/* Qty + Cost */}
          <div className={`grid gap-3 ${isOwnerOrAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="block">
                <span className="ui-label">
                Quantity (Litres) <span className="text-red-500">*</span>
              </span>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={row.qty}
                  onChange={e => onChange('qty', limitDecimals(e.target.value, 3))}
                  placeholder="e.g. 5000"
                  className="shadow-sm"
                />
              </label>
            </div>
            {isOwnerOrAdmin && (
              <div>
                <label className="block">
                  <span className="ui-label">
                  Cost per Litre (₹) <span className="text-red-500">*</span>
                </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={row.costPrice}
                    onChange={e => onChange('costPrice', limitDecimals(e.target.value, 2))}
                    placeholder="e.g. 88.50"
                    className="shadow-sm"
                  />
                </label>
              </div>
            )}
          </div>
          {!isOwnerOrAdmin && (
            <p className="text-xs text-slate-500">
              Cost price is managed by Owner / Admin. The last recorded price for this tank will be used.
            </p>
          )}

          {/* Per-row live previews */}
          {(afterStock !== null || (isOwnerOrAdmin && rowCost > 0)) && (
            <div className="flex items-center flex-wrap gap-3 text-xs">
              {isOwnerOrAdmin && rowCost > 0 && !rowOverflow && (
                <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg font-medium">
                  ₹{rowCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} delivery cost
                </span>
              )}
              {afterStock !== null && row.qty && (
                rowOverflow ? (
                  <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    Exceeds capacity — available: {availableSpace!.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                  </span>
                ) : (
                  <span className="text-slate-500">
                    Stock after: <span className="font-semibold text-slate-600">
                      {afterStock.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                    </span>
                    {tank && tank.capacity > 0 && ` / ${tank.capacity.toLocaleString('en-IN', { minimumFractionDigits: 0 })} L`}
                  </span>
                )
              )}
            </div>
          )}

          {/* Collapse button */}
          {isFilled && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => onExpandedChange(null)}
                className="ui-btn ui-btn-ghost text-xs px-3 py-1.5 min-h-0"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
