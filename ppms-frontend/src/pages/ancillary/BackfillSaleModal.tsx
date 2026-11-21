import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, ChevronLeft } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct, BackfillSaleRequest, AncillaryPaymentMode } from '../../api/ancillaryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { PAYMENT_MODES, fmtDate } from './ancillaryFormat'
import { ReviewRow } from './ReviewRow'
import { codeLabel } from '../../constants/labels'

// ── Backfill Sale Modal ───────────────────────────────────────────────────────
/**
 * 2-step modal for Admin/Owner to retroactively record a historical counter sale.
 *
 * Key differences from the live SellDialog:
 * - Requires a past date (saleDate strictly before today).
 * - The selling price is NOT entered by the user — the backend resolves it from
 *   the product's price history for the chosen date.
 * - FIFO deduction is restricted to lots delivered on or before saleDate.
 * - Before recording a sale for a date, the product must have a historical stock
 *   delivery on or before that date (enforce this via the Stock In tab first).
 */
export function BackfillSaleModal({
  pumpId, products, onClose, onSuccess,
}: {
  pumpId: number
  products: AncillaryProduct[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { addToast } = useToastStore()
  const yesterday = localDateInputValue(-1)

  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<BackfillSaleRequest>({
    productId: products[0]?.id ?? 0,
    saleDate: yesterday,
    quantityUnits: 1,
    paymentMode: 'CASH',
  })
  const [error, setError] = useState<string | null>(null)

  const backfillMutation = useMutation({
    mutationFn: (data: BackfillSaleRequest) => ancillaryApi.backfillSale(pumpId, data),
    onSuccess: () => {
      addToast('Historical sale backfilled successfully', 'success')
      onSuccess()
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to backfill sale')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const selectedProduct = products.find(p => p.id === form.productId) ?? null

  const validate = (): string | null => {
    if (!form.productId) return 'Select a product'
    if (!form.saleDate) return 'Sale date is required'
    if (form.saleDate >= localDateInputValue()) {
      return 'Sale date must be before today. Use the Sell button on the Products tab for today\'s sales.'
    }
    if (!form.quantityUnits || form.quantityUnits < 1) return 'Quantity must be at least 1'
    if (form.paymentMode === 'CREDIT' && !form.clientName?.trim()) {
      return 'Client name is required for CREDIT payment mode'
    }
    return null
  }

  const handleReview = () => {
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    setStep('review')
  }

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
    <div className="ui-modal-backdrop px-4">
      <div className="ui-modal-panel w-full max-w-md">

        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">
              {step === 'form' ? 'Backfill Sale' : 'Review Backfill Sale'}
            </h3>
            <p className="ui-modal-subtitle">
              {step === 'form'
                ? 'Enter a historical counter sale. Price is resolved from price history.'
                : 'Review the details before submitting.'}
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

            {/* Info banner about price resolution */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
              <strong>Note:</strong> The selling price will be automatically resolved from the product's
              price history for the selected date. Make sure a price was set on or before that date.
              Stock must also have been delivered on or before the sale date.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <span className="ui-label">Product *</span>
                <SearchableSelect label="Product"
                  value={form.productId ? form.productId.toString() : ''}
                  onChange={v => setForm(f => ({ ...f, productId: v ? parseInt(v) : 0 }))}
                  placeholder="Select product…"
                  options={products.map(p => ({ value: p.id.toString(), label: `${p.displayName} (stock: ${p.currentStockUnits})` }))}
                />
              </div>

              <div>
                <label className="block">
                  <span className="ui-label">Sale Date * (past only)</span>
                  <input
                    type="date"
                    className="text-sm"
                    value={form.saleDate}
                    max={yesterday}
                    onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))}
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="ui-label">Quantity (units) *</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="text-sm"
                    value={form.quantityUnits}
                    onChange={e => setForm(f => ({ ...f, quantityUnits: parseInt(e.target.value) || 0 }))}
                  />
                </label>
              </div>

              <div className="sm:col-span-2">
                <span className="ui-label">Payment Mode *</span>
                <SearchableSelect label="Payment Mode"
                  value={form.paymentMode}
                  onChange={v => setForm(f => ({
                    ...f,
                    paymentMode: v as AncillaryPaymentMode,
                    clientName: v !== 'CREDIT' ? undefined : f.clientName,
                  }))}
                  options={PAYMENT_MODES.map(m => ({ value: m, label: codeLabel(m) }))}
                />
              </div>

              {form.paymentMode === 'CREDIT' && (
                <div className="sm:col-span-2">
                  <label className="block">
                    <span className="ui-label">Client Name * (required for credit)</span>
                    <input
                      className="text-sm"
                      value={form.clientName ?? ''}
                      onChange={e => setForm(f => ({ ...f, clientName: e.target.value || undefined }))}
                      placeholder="Enter client name"
                    />
                  </label>
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

              <div>
                <label className="block">
                  <span className="ui-label">Notes</span>
                  <input
                    className="text-sm"
                    value={form.notes ?? ''}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value || undefined }))}
                    placeholder="Optional"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Review */}
        {step === 'review' && (
          <div className="ui-modal-body space-y-4">
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5 text-xs text-violet-700 font-medium">
              This sale will be recorded as <strong>Backfilled</strong> for {fmtDate(form.saleDate)}.
              The selling price is resolved from price history.
            </div>

            <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
              <ReviewRow label="Product" value={selectedProduct?.displayName ?? '—'} />
              <ReviewRow label="Sale Date" value={fmtDate(form.saleDate)} />
              <ReviewRow label="Quantity" value={`${form.quantityUnits} unit${form.quantityUnits !== 1 ? 's' : ''}`} />
              <ReviewRow label="Payment Mode" value={codeLabel(form.paymentMode)} />
              {form.paymentMode === 'CREDIT' && <ReviewRow label="Client" value={form.clientName ?? '—'} />}
              {form.billNo && <ReviewRow label="Bill No" value={form.billNo} />}
              {form.notes && <ReviewRow label="Notes" value={form.notes} />}
              <ReviewRow label="Price" value="Resolved from price history" />
            </div>

            {error && (
              <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="ui-modal-footer">
          {step === 'form' ? (
            <>
              <button onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
              <button onClick={handleReview} className="ui-btn ui-btn-primary">Review →</button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('form'); setError(null) }}
                className="ui-btn ui-btn-secondary"
              >
                <span className="inline-flex items-center gap-1.5"><ChevronLeft size={14} strokeWidth={2} />Back</span>
              </button>
              <button
                onClick={() => backfillMutation.mutate(form)}
                disabled={backfillMutation.isPending}
                className="ui-btn ui-btn-primary disabled:opacity-50"
              >
                {backfillMutation.isPending
                  ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Recording…</span>
                  : 'Confirm Backfill'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
