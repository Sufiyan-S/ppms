import { useState } from 'react'
import { useOnValuesChange } from '../../../hooks/useOnValuesChange'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { inventoryApi } from '../../../api/inventoryApi'
import { tankerApi } from '../../../api/tankerApi'
import type { Tanker } from '../../../api/tankerApi'
import type { TankStock, RecordBatchDeliveryRequest } from '../../../api/inventoryApi'
import { localDateInputValue } from '../../../utils/date'
import { ModalPortal } from '../../../components/ModalPortal'
import { parseApiError } from '../../../utils/apiError'
import { Spinner } from '../../../components/Spinner'
import { limitDecimals } from '../inventoryFormat'
import { _rowSeq, newRow } from './deliveryRows'
import type { DeliveryRow, PreparedDeliveryItem } from './deliveryRows'
import { DeliveryRowEditor } from './DeliveryRowEditor'
import { DeliveryHeaderFields } from './DeliveryHeaderFields'
import { DeliveryReviewDialog } from './DeliveryReviewDialog'
import { IconButton } from '../../../components/IconButton'

export function RecordDeliveryModal({
  pumpId,
  tanks,
  isOwnerOrAdmin,
  canSetBillTotal,
  onClose,
}: {
  pumpId: number
  tanks: TankStock[]
  isOwnerOrAdmin: boolean
  canSetBillTotal: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const defaultTankId = tanks[0]?.tankId ? String(tanks[0].tankId) : ''

  const { data: tankers = [] } = useQuery<Tanker[]>({
    queryKey: ['tankers', pumpId],
    queryFn: () => tankerApi.getTankers(pumpId),
  })

  const [date,              setDate]              = useState(localDateInputValue())
  const [invoice,           setInvoice]           = useState('')
  const [rows,              setRows]              = useState<DeliveryRow[]>([newRow(defaultTankId)])
  const [expandedRowId,     setExpandedRowId]     = useState<number | null>(() => _rowSeq)
  const [error,             setError]             = useState<string | null>(null)
  const [reviewOpen,        setReviewOpen]        = useState(false)
  const [billTotalStr,      setBillTotalStr]      = useState('')
  const [billTotalManual,   setBillTotalManual]   = useState(false)
  const [selectedTankerId,  setSelectedTankerId]  = useState<number | null>(
    () => tankers.find(t => t.defaultTanker)?.id ?? null
  )

  const mutation = useMutation({
    mutationFn: (req: RecordBatchDeliveryRequest) =>
      inventoryApi.recordBatchDelivery(pumpId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['deliveries', pumpId] })
      onClose()
    },
    onError: (err) =>
      setError(parseApiError(err, 'Failed to record delivery')),
  })

  const updateRow = (id: number, field: keyof Omit<DeliveryRow, 'id'>, value: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))

  const addRow = () => {
    const r = newRow(defaultTankId)
    setRows(prev => [...prev, r])
    setExpandedRowId(r.id)
  }

  const removeRow = (id: number) => {
    setRows(prev => prev.filter(r => r.id !== id))
    if (expandedRowId === id) setExpandedRowId(null)
  }

  const grandTotal = isOwnerOrAdmin
    ? rows.reduce((sum, r) => {
        const q = parseFloat(r.qty) || 0
        const c = parseFloat(r.costPrice) || 0
        return sum + q * c
      }, 0)
    : 0

  const defaultTankerId = tankers.find(t => t.defaultTanker)?.id ?? null
  useOnValuesChange([defaultTankerId], () => {
    if (defaultTankerId !== null && selectedTankerId === null) setSelectedTankerId(defaultTankerId)
  })

  const billTotalText = billTotalManual ? billTotalStr : (grandTotal > 0 ? grandTotal.toFixed(2) : '')
  const billTotalNum = parseFloat(billTotalText) || 0
  const otherCharges = billTotalNum - grandTotal

  const selectedTanker = tankers.find(t => t.id === selectedTankerId) ?? null
  const totalEnteredQty = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0)
  const tankerRemaining = selectedTanker ? selectedTanker.capacityLitres - totalEnteredQty : null
  const tankerMismatch = selectedTanker !== null && Math.abs(totalEnteredQty - selectedTanker.capacityLitres) > 0.01

  const anyTankOverflow = rows.some(r => {
    const t = tanks.find(tk => tk.tankId === Number(r.tankId))
    const q = parseFloat(r.qty) || 0
    return t && t.capacity > 0 && q > 0 && q > (t.capacity - t.currentStock)
  })

  const buildPreparedItems = (): { items: PreparedDeliveryItem[] | null; error: string | null } => {
    if (!date || !invoice.trim()) {
      return { items: null, error: 'Delivery date and invoice number are required.' }
    }

    for (const r of rows) {
      if (!r.tankId) return { items: null, error: 'Please select a tank for every row.' }
      const q = parseFloat(r.qty)
      if (!r.qty || isNaN(q) || q <= 0) return { items: null, error: 'Quantity must be greater than 0 for every row.' }
      const rowTank = tanks.find(t => t.tankId === Number(r.tankId))
      if (rowTank && rowTank.capacity > 0) {
        const availableSpace = rowTank.capacity - rowTank.currentStock
        if (q > availableSpace) {
          return {
            items: null,
            error: `${rowTank.tankIdentifier}: quantity (${q.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L) exceeds available space (${availableSpace.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L).`,
          }
        }
      }
      if (isOwnerOrAdmin) {
        const c = parseFloat(r.costPrice)
        if (!r.costPrice || isNaN(c) || c <= 0) return { items: null, error: 'Cost per litre must be greater than 0 for every row.' }
      }
    }

    const selectedTankIds = rows.map(r => r.tankId)
    const unique = new Set(selectedTankIds)
    if (unique.size !== selectedTankIds.length) {
      return { items: null, error: 'The same tank is selected more than once. Each tank can only appear once per delivery.' }
    }

    const preparedItems = rows.map((r) => {
      const tank = tanks.find(t => t.tankId === Number(r.tankId))
      if (!tank) {
        throw new Error('Selected tank not found.')
      }

      const quantityDelivered = parseFloat(r.qty)
      const costPricePerUnit = isOwnerOrAdmin ? parseFloat(r.costPrice) : 0

      return {
        tankId: tank.tankId,
        tankIdentifier: tank.tankIdentifier,
        fuelType: tank.fuelType,
        quantityDelivered,
        costPricePerUnit,
        totalCost: isOwnerOrAdmin ? quantityDelivered * costPricePerUnit : 0,
        stockAfter: tank.currentStock + quantityDelivered,
        capacity: tank.capacity,
      }
    })

    return { items: preparedItems, error: null }
  }

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      const { items, error } = buildPreparedItems()
      if (error || !items) {
        setError(error)
        return
      }

      setReviewOpen(true)
    } catch {
      setError('One of the selected tanks could not be found. Please review the entries.')
      return
    }
  }

  const handleConfirmSubmit = () => {
    try {
      const { items, error } = buildPreparedItems()
      if (error || !items) {
        setError(error)
        return
      }

      mutation.mutate({
        deliveryDate:     date,
        invoiceReference: invoice.trim(),
        billTotal: canSetBillTotal && billTotalNum > 0 ? billTotalNum : null,
        tankerId: selectedTankerId ?? null,
        items: items.map(item => ({
          tankId: item.tankId,
          quantityDelivered: item.quantityDelivered,
          costPricePerUnit: isOwnerOrAdmin ? item.costPricePerUnit : null,
        })),
      })
    } catch {
      setError('One of the selected tanks could not be found. Please review the entries.')
    }
  }

  const tankOptions = tanks.map(t => ({
    value: String(t.tankId),
    label: `${t.tankIdentifier} — ${t.fuelType} (${t.currentStock.toFixed(0)} L remaining)`,
  }))

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
    <div className="ui-modal-backdrop">
      <div
        className="ui-modal-panel"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info flex-shrink-0">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Record Tanker Delivery</h2>
            <p className="ui-modal-subtitle">
              One tanker · one invoice · multiple tanks
            </p>
          </div>
          <IconButton label="Close" icon="×" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close" />
        </div>

        <form onSubmit={handleReview} className="flex flex-col flex-1 overflow-hidden">
          {/* Shared fields — delivery date + invoice + tanker */}
          <DeliveryHeaderFields
            date={date}
            setDate={setDate}
            invoice={invoice}
            setInvoice={setInvoice}
            tankers={tankers}
            selectedTanker={selectedTanker}
            selectedTankerId={selectedTankerId}
            setSelectedTankerId={setSelectedTankerId}
            tankerMismatch={tankerMismatch}
            tankerRemaining={tankerRemaining}
            totalEnteredQty={totalEnteredQty}
          />

          {/* Scrollable tank rows */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {rows.map((row, idx) => (
              <DeliveryRowEditor
                key={row.id}
                row={row}
                rowNumber={idx + 1}
                tanks={tanks}
                tankOptions={tankOptions}
                isOwnerOrAdmin={isOwnerOrAdmin}
                isExpanded={expandedRowId === row.id}
                onExpandedChange={setExpandedRowId}
                canRemove={rows.length > 1}
                onRemove={() => removeRow(row.id)}
                onChange={(field, value) => updateRow(row.id, field, value)}
              />
            ))}

            {/* Add another tank button */}
            <button
              type="button"
              onClick={addRow}
              className="ui-btn ui-btn-secondary w-full border-2 border-dashed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add another tank
            </button>
          </div>

          {/* Footer — grand total + actions */}
          <div className="border-t border-slate-100 flex-shrink-0 px-6 py-4 space-y-3">
            {/* Bill total — visible to OWNER/ADMIN (auto-filled from calc) and MANAGER (manual entry) */}
            {canSetBillTotal && (
              <div className="space-y-2 rounded-xl bg-blue-50 px-4 py-3">
                {isOwnerOrAdmin && grandTotal > 0 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-blue-600 font-medium">
                      Calculated Total ({rows.length} tank{rows.length > 1 ? 's' : ''})
                    </p>
                    <p className="text-sm font-semibold text-blue-700">
                      ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label htmlFor="delivery-bill-total" className="text-xs text-blue-600 font-medium shrink-0">Bill Amount (₹)</label>
                  <input id="delivery-bill-total"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={billTotalText}
                    onChange={e => { setBillTotalStr(limitDecimals(e.target.value, 2)); setBillTotalManual(true) }}
                    onBlur={() => { if (!billTotalText.trim()) setBillTotalManual(false) }}
                    className="ui-input text-sm font-semibold text-blue-900 bg-white border-blue-200 focus:border-blue-400 flex-1 min-w-0"
                    placeholder="Enter actual bill amount"
                  />
                </div>
                {!isOwnerOrAdmin && (
                  <p className="text-xs text-slate-500">Enter the total amount shown on the supplier's invoice.</p>
                )}
                {isOwnerOrAdmin && billTotalManual && otherCharges !== 0 && (
                  <p className="text-xs text-blue-500">
                    Other charges:{' '}
                    <span className={`font-medium ${otherCharges > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {otherCharges > 0 ? '+' : ''}₹{Math.abs(otherCharges).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-slate-500"> (freight / taxes / other)</span>
                  </p>
                )}
              </div>
            )}

            {error && (
              <div role="alert" className="ui-alert ui-alert-danger text-xs">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="ui-btn ui-btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending || tankerMismatch || anyTankOverflow}
                title={
                  tankerMismatch ? `Total must equal tanker capacity (${selectedTanker?.capacityLitres.toLocaleString('en-IN')} L)`
                  : anyTankOverflow ? 'One or more tank quantities exceed available capacity'
                  : undefined
                }
                className="ui-btn ui-btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Recording…</span> : 'Review Delivery'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {reviewOpen && (() => {
        try {
          const { items } = buildPreparedItems()
          if (!items) return null

          return (
        <DeliveryReviewDialog
          items={items}
          date={date}
          invoice={invoice}
          error={error}
          isOwnerOrAdmin={isOwnerOrAdmin}
          canSetBillTotal={canSetBillTotal}
          billTotalManual={billTotalManual}
          billTotalNum={billTotalNum}
          otherCharges={otherCharges}
          isPending={mutation.isPending}
          onBack={() => setReviewOpen(false)}
          onConfirm={handleConfirmSubmit}
        />
          )
        } catch {
          return null
        }
      })()}
    </div>
    </ModalPortal>
  )
}
