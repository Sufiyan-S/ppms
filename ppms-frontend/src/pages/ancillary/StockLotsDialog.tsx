import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct, AncillaryLotDetail, UpdateLotRequest } from '../../api/ancillaryApi'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { fmtCurrency, fmtDate } from './ancillaryFormat'

// ── Stock Lots Dialog ─────────────────────────────────────────────────────────
/**
 * Shows all ACTIVE FIFO lots for a product in consumption order (oldest first).
 * Each row shows: In Date, Bill No, Cost Price/unit, Remaining, Original.
 * Owner/Admin can edit remaining quantity and cost price inline per row.
 * Editing remaining quantity automatically adjusts product.currentStockUnits on the backend.
 */
export function StockLotsDialog({
  pumpId, product, isOwnerOrAdmin, onClose, onUpdated,
}: {
  pumpId: number
  product: AncillaryProduct
  isOwnerOrAdmin: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [editingLotId, setEditingLotId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ costPricePerUnit: string; remainingQuantity: string }>({
    costPricePerUnit: '',
    remainingQuantity: '',
  })
  const [editError, setEditError] = useState<string | null>(null)

  const { data: lots = [], isLoading } = useQuery<AncillaryLotDetail[]>({
    queryKey: ['ancillaryLots', pumpId, product.id],
    queryFn:  () => ancillaryApi.getLots(pumpId, product.id),
  })

  const updateMutation = useMutation({
    mutationFn: ({ lotId, data }: { lotId: number; data: UpdateLotRequest }) =>
      ancillaryApi.updateLot(pumpId, lotId, data),
    onSuccess: () => {
      setEditingLotId(null)
      setEditError(null)
      qc.invalidateQueries({ queryKey: ['ancillaryLots', pumpId, product.id] })
      addToast('Lot updated successfully', 'success')
      onUpdated()
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to update lot')
      setEditError(msg)
      addToast(msg, 'error')
    },
  })

  const startEdit = (lot: AncillaryLotDetail) => {
    setEditingLotId(lot.id)
    setEditForm({
      costPricePerUnit: lot.costPricePerUnit.toString(),
      remainingQuantity: lot.remainingQuantity.toString(),
    })
    setEditError(null)
  }

  const handleSave = (lot: AncillaryLotDetail) => {
    const newCost = parseFloat(editForm.costPricePerUnit)
    const newQty  = parseInt(editForm.remainingQuantity, 10)
    if (isNaN(newCost) || newCost <= 0) { setEditError('Cost price must be greater than 0'); return }
    if (isNaN(newQty)  || newQty  <  0) { setEditError('Remaining quantity cannot be negative'); return }
    if (newQty > lot.originalQuantity)  { setEditError(`Remaining quantity cannot exceed original (${lot.originalQuantity})`); return }

    const payload: UpdateLotRequest = {}
    if (newCost !== lot.costPricePerUnit)  payload.costPricePerUnit  = newCost
    if (newQty  !== lot.remainingQuantity) payload.remainingQuantity = newQty
    if (Object.keys(payload).length === 0) { setEditingLotId(null); return }

    updateMutation.mutate({ lotId: lot.id, data: payload })
  }

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel ui-modal-panel--lg w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info shrink-0">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">Stock Lots</h3>
            <p className="ui-modal-subtitle truncate max-w-[380px]">{product.displayName}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Body */}
        <div className="ui-modal-body overflow-auto flex-1">
          {isLoading ? (
            <p className="ui-empty py-8">Loading lots…</p>
          ) : lots.length === 0 ? (
            <p className="ui-empty py-8">No active stock lots. Record a stock delivery first.</p>
          ) : (
            <>
              {editError && (
                <div role="alert" className="ui-alert ui-alert-danger mb-3 text-sm">{editError}</div>
              )}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200">
                    <th scope="col" className="text-left pb-2 pr-4 font-medium">In Date</th>
                    <th scope="col" className="text-left pb-2 pr-4 font-medium">Bill No</th>
                    <th scope="col" className="text-right pb-2 pr-4 font-medium">Cost Price/Unit</th>
                    <th scope="col" className="text-right pb-2 pr-4 font-medium">Remaining</th>
                    <th scope="col" className="text-right pb-2 pr-4 font-medium">Original</th>
                    {isOwnerOrAdmin && <th scope="col" className="text-right pb-2 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lots.map((lot, idx) => (
                    <tr key={lot.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      {editingLotId === lot.id ? (
                        <>
                          <td className="py-2.5 pr-4 text-slate-700">{fmtDate(lot.deliveryDate)}</td>
                          <td className="py-2.5 pr-4 text-slate-500">{lot.invoiceReference ?? '—'}</td>
                          <td className="py-2.5 pr-4 text-right">
                            <input aria-label="Cost price per unit"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={editForm.costPricePerUnit}
                              onChange={e => setEditForm(f => ({ ...f, costPricePerUnit: e.target.value }))}
                              className="w-24 text-right text-sm"
                            />
                          </td>
                          <td className="py-2.5 pr-4 text-right">
                            <input aria-label="Remaining units"
                              type="number"
                              min="0"
                              max={lot.originalQuantity}
                              step="1"
                              value={editForm.remainingQuantity}
                              onChange={e => setEditForm(f => ({ ...f, remainingQuantity: e.target.value }))}
                              className="w-20 text-right text-sm"
                            />
                          </td>
                          <td className="py-2.5 pr-4 text-right text-slate-500">{lot.originalQuantity}</td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleSave(lot)}
                                disabled={updateMutation.isPending}
                              className="ui-btn ui-btn-primary min-h-0 px-3 py-1 text-xs disabled:opacity-50"
                              >
                                {updateMutation.isPending ? <span className="flex items-center gap-1"><Spinner className="w-3 h-3" />Saving…</span> : 'Save'}
                              </button>
                              <button
                                onClick={() => { setEditingLotId(null); setEditError(null) }}
                                className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 pr-4 text-slate-700">{fmtDate(lot.deliveryDate)}</td>
                          <td className="py-2.5 pr-4 text-slate-500">{lot.invoiceReference ?? '—'}</td>
                          <td className="py-2.5 pr-4 text-right font-medium text-slate-800">{fmtCurrency(lot.costPricePerUnit)}</td>
                          <td className="py-2.5 pr-4 text-right">
                            <span className="font-semibold text-emerald-700">{lot.remainingQuantity}</span>
                          </td>
                          <td className="py-2.5 pr-4 text-right text-slate-500">{lot.originalQuantity}</td>
                          {isOwnerOrAdmin && (
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => startEdit(lot)}
                              className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="ui-modal-footer shrink-0 justify-between items-center">
          <p className="text-xs text-slate-500">
            Lots shown in FIFO order — oldest consumed first
          </p>
          <button
            onClick={onClose}
            className="ui-btn ui-btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
