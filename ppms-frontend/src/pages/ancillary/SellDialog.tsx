import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, ArrowRight, ChevronLeft } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import { pumpApi } from '../../api/pumpApi'
import type { AncillaryProduct, RecordAncillarySaleRequest, AncillaryPaymentMode } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { PAYMENT_MODES, fmtCurrency } from './ancillaryFormat'
import { ReviewRow } from './ReviewRow'
import { codeLabel } from '../../constants/labels'

// ── Sell Dialog ───────────────────────────────────────────────────────────────
/**
 * Computes the projected total profit for a sale by walking through active FIFO lots
 * in consumption order and computing (sellPrice - costPrice) × consumedQty per batch.
 *
 * This correctly handles multi-batch sales where different lots have different cost prices.
 * Example: lots = [{5 units @ ₹100}, {2 units @ ₹200}], sell 6 @ ₹120
 *   → batch1: (120-100)×5 = 100, batch2: (120-200)×1 = -80 → total = 20
 *   (the old approach of (120-100)×6 = 120 was incorrect)
 *
 * Returns null when lot data is insufficient to cover the requested quantity
 * (e.g. lots were consumed by another sale after the page loaded).
 */
function computeFifoProjectedProfit(
  qty: number,
  sellPricePerUnit: number,
  lots: AncillaryProduct['activeFifoLots'],
): number | null {
  if (!lots || lots.length === 0) return null
  let remaining = qty
  let totalCost = 0
  for (const lot of lots) {
    if (remaining <= 0) break
    const consumed = Math.min(remaining, lot.remainingQuantity)
    totalCost += consumed * lot.costPricePerUnit
    remaining -= consumed
  }
  if (remaining > 0) return null  // insufficient lot data for this quantity
  return qty * sellPricePerUnit - totalCost
}

// 2-step modal: Step 1 = fill form, Step 2 = review & confirm

export function SellDialog({
  pumpId, product, onClose, onSuccess,
}: {
  pumpId: number
  product: AncillaryProduct
  onClose: () => void
  onSuccess: () => void
}) {
  const { addToast } = useToastStore()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const canSeeCost = user?.role !== 'OPERATOR'
  const canOverridePrice = user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<RecordAncillarySaleRequest>({
    productId: product.id,
    quantityUnits: 1,
    sellingPricePerUnit: 0,
    paymentMode: 'CASH',
  })
  const [error, setError] = useState<string | null>(null)

  // Sales must use the configured price; only Owner/Admin may change it for a single sale.
  const { data: priceHistory, isLoading: priceLoading } = useQuery({
    queryKey: ['ancillary-price-history', pumpId, product.id],
    queryFn: () => ancillaryApi.getPriceHistory(pumpId, product.id),
  })
  const [openedAt] = useState(() => Date.now())
  const configuredPrice = priceHistory
    ?.filter(p => new Date(p.effectiveFrom).getTime() <= openedAt)
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0]
    ?.pricePerUnit ?? null
  const [appliedPrice, setAppliedPrice] = useState<number | null>(null)
  if (configuredPrice != null && configuredPrice !== appliedPrice) {
    setAppliedPrice(configuredPrice)
    setForm(f => ({ ...f, sellingPricePerUnit: configuredPrice }))
  }

  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn: () => pumpApi.getCreditClients(pumpId),
    enabled: form.paymentMode === 'CREDIT',
  })

  const saleMutation = useMutation({
    mutationFn: (data: RecordAncillarySaleRequest) => ancillaryApi.recordSale(pumpId, data),
    onSuccess: (_, data) => {
      if (data.paymentMode === 'CREDIT') {
        queryClient.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
        queryClient.invalidateQueries({ queryKey: ['credit-transactions', pumpId] })
      }
      addToast('Sale recorded successfully', 'success')
      onSuccess()
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to record sale')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const handleProceedToReview = () => {
    if (!form.quantityUnits || form.quantityUnits < 1) { setError('Quantity must be at least 1'); return }
    if (!form.sellingPricePerUnit || form.sellingPricePerUnit <= 0) { setError('Enter a valid selling price greater than 0'); return }
    if (form.paymentMode === 'CREDIT' && !form.clientId) { setError('Please select a client for CREDIT payment'); return }
    setError(null)
    setStep('review')
  }

  const buyPrice   = canSeeCost ? product.fifoCostPricePerUnit : null
  const sellPrice  = form.sellingPricePerUnit > 0 ? form.sellingPricePerUnit : null
  const totalAmount = sellPrice != null && form.quantityUnits > 0
    ? sellPrice * form.quantityUnits
    : null

  // Profit/loss indicator: walks FIFO lots in order so multi-batch sales are correct.
  // e.g. sell 6 from lots [5@100, 2@200] @ 120 → (120-100)×5 + (120-200)×1 = 20, not 120.
  const projectedProfit = (canSeeCost && sellPrice != null && form.quantityUnits > 0)
    ? computeFifoProjectedProfit(form.quantityUnits, sellPrice, product.activeFifoLots)
    : null
  const marginBadge = projectedProfit == null ? null
    : projectedProfit > 0 ? { label: `Projected profit: +${fmtCurrency(projectedProfit)}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : projectedProfit < 0 ? { label: `Projected loss: ${fmtCurrency(projectedProfit)}`,    cls: 'bg-red-50 text-red-700 border-red-200' }
    :                        { label: 'Break-even',                                          cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  const headerToneClass = projectedProfit == null
    ? 'ui-modal-header--neutral'
    : projectedProfit > 0
      ? 'ui-modal-header--success'
      : projectedProfit < 0
        ? 'ui-modal-header--danger'
        : 'ui-modal-header--neutral'

  const selectedClient = creditClients.find(c => c.id === form.clientId)

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop px-4">
      <div className="ui-modal-panel w-full max-w-md">

        {/* Header */}
        <div className={`ui-modal-header ui-modal-header--themed ${headerToneClass}`}>
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">
              {step === 'form' ? 'Record Sale' : 'Review & Confirm'}
            </h3>
            <p className="ui-modal-subtitle break-words">
              {product.displayName}
              {marginBadge ? ` · ${marginBadge.label}` : ''}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Step 1 — Form */}
        {step === 'form' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}

            {/* Stock + buy price info row */}
            <div className="bg-slate-50 rounded-lg px-4 py-3 flex items-center justify-between text-sm gap-4">
              <div className="flex items-center gap-3">
                <span className="text-slate-500">Stock</span>
                <span className={`font-medium ${
                  product.currentStockUnits <= (product.lowStockThreshold ?? Infinity) ? 'text-red-600' : 'text-slate-800'
                }`}>{product.currentStockUnits} units</span>
              </div>
              {buyPrice != null && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Buy price</span>
                  <span className="font-semibold text-slate-700">{fmtCurrency(buyPrice)}/unit</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block">
                    <span className="ui-label">Quantity (units) *</span>
                    <input
                      type="number" min="1" step="1" data-autofocus
                      className="text-sm"
                      value={form.quantityUnits}
                      onChange={e => setForm(f => ({ ...f, quantityUnits: parseInt(e.target.value) || 0 }))}
                    />
                  </label>
                </div>
                <div>
                  <label className="block">
                    <span className="ui-label">Selling Price (₹/unit) *</span>
                    <input
                      type="number" min="0.01" step="0.01"
                      className="text-sm"
                      value={form.sellingPricePerUnit || ''}
                      onChange={e => setForm(f => ({ ...f, sellingPricePerUnit: parseFloat(e.target.value) || 0 }))}
                      placeholder={priceLoading ? 'Loading…' : 'MRP'}
                      readOnly={!canOverridePrice}
                      disabled={configuredPrice == null}
                    />
                  </label>
                  {!priceLoading && configuredPrice == null && (
                    <p className="text-xs text-red-600 mt-1">No selling price is set for this product. Set a price first.</p>
                  )}
                </div>
              </div>

              {/* Profit/loss badge — total projected profit across all FIFO batches */}
              {marginBadge && (
                <div className={`rounded-lg px-4 py-2 border text-xs font-medium ${marginBadge.cls}`}>
                  {marginBadge.label}
                </div>
              )}

              <div>
                <span className="ui-label">Payment Mode *</span>
                <SearchableSelect label="Payment Mode"
                  value={form.paymentMode}
                  onChange={v => setForm(f => ({
                    ...f,
                    paymentMode: v as AncillaryPaymentMode,
                    clientId: v !== 'CREDIT' ? undefined : f.clientId,
                    clientName: v !== 'CREDIT' ? undefined : f.clientName,
                  }))}
                  options={PAYMENT_MODES.map(m => ({ value: m, label: codeLabel(m) }))}
                />
              </div>

              {form.paymentMode === 'CREDIT' && (
                <div>
                  <span className="ui-label">Client * (required for credit)</span>
                  <SearchableSelect label="Client"
                    value={form.clientId ? form.clientId.toString() : ''}
                    onChange={v => {
                      const client = creditClients.find(c => c.id === parseInt(v))
                      setForm(f => ({ ...f, clientId: client?.id, clientName: client?.name }))
                    }}
                    placeholder="Search client…"
                    options={creditClients.map(c => ({
                      value: c.id.toString(),
                      label: c.name + (c.phone ? ` · ${c.phone}` : ''),
                    }))}
                  />
                </div>
              )}

              <div>
                <label className="block">
                  <span className="ui-label">Bill No</span>
                  <input
                    className="text-sm"
                    value={form.billNo ?? ''}
                    onChange={e => setForm(f => ({ ...f, billNo: e.target.value || undefined }))}
                    placeholder="Optional"
                  />
                </label>
              </div>
            </div>

            {/* Live total */}
            {totalAmount != null && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-blue-600">Total</span>
                <span className="text-sm font-semibold text-blue-700">{fmtCurrency(totalAmount)}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="ui-btn ui-btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleProceedToReview}
                className="ui-btn ui-btn-primary"
              >
                <span className="inline-flex items-center gap-1.5">Review<ArrowRight size={14} strokeWidth={2} /></span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Review */}
        {step === 'review' && (
          <div className="ui-modal-body space-y-4">
            <p className="text-sm text-slate-500">Please review the details before confirming.</p>

            <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
              <ReviewRow label="Product" value={product.displayName} />
              <ReviewRow label="Quantity" value={`${form.quantityUnits} unit${form.quantityUnits !== 1 ? 's' : ''}`} />
              {buyPrice != null && <ReviewRow label="Buy price / unit" value={fmtCurrency(buyPrice)} />}
              <ReviewRow label="Sell price / unit" value={fmtCurrency(form.sellingPricePerUnit)} />
              <ReviewRow label="Total" value={fmtCurrency(totalAmount)} highlight />
              {marginBadge && (
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-b-xl ${marginBadge.cls}`}>
                  <span className="text-xs">Margin</span>
                  <span className="text-xs font-semibold">{marginBadge.label}</span>
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
              <ReviewRow label="Payment mode" value={codeLabel(form.paymentMode)} />
              {form.paymentMode === 'CREDIT' && selectedClient && (
                <ReviewRow label="Client" value={selectedClient.name} />
              )}
              {form.billNo && <ReviewRow label="Bill No" value={form.billNo} />}
            </div>

            {error && (
              <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}

            <div className="flex justify-between gap-2 pt-1">
              <button
                onClick={() => { setStep('form'); setError(null) }}
                className="ui-btn ui-btn-secondary"
              >
                <span className="inline-flex items-center gap-1.5"><ChevronLeft size={14} strokeWidth={2} />Back</span>
              </button>
              <button
                onClick={() => saleMutation.mutate(form)}
                disabled={saleMutation.isPending}
                className="ui-btn ui-btn-primary disabled:opacity-50"
              >
                {saleMutation.isPending
                  ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Recording…</span>
                  : 'Confirm Sale'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}
