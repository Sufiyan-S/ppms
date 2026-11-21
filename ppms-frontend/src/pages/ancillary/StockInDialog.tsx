import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct, RecordStockDeliveryRequest } from '../../api/ancillaryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { localDateInputValue } from '../../utils/date'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { ReviewRow } from './ReviewRow'
import { fmtCurrency, fmtDate } from './ancillaryFormat'

export function StockInDialog({
  pumpId, products, onClose, onSuccess,
}: {
  pumpId: number
  products: AncillaryProduct[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { addToast } = useToastStore()
  const today = localDateInputValue()
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<RecordStockDeliveryRequest & { productId: number | '' }>({
    productId: products[0]?.id ?? '',
    quantityUnits: 1,
    costPricePerUnit: 0,
    deliveryDate: today,
    invoiceReference: '',
  })
  const [error, setError] = useState<string | null>(null)

  const deliveryMutation = useMutation({
    mutationFn: (data: { productId: number; req: RecordStockDeliveryRequest }) =>
      ancillaryApi.recordDelivery(pumpId, data.productId, data.req),
    onSuccess: () => {
      addToast('Stock delivery recorded successfully', 'success')
      onSuccess()
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to record delivery')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const selectedProduct = products.find(p => p.id === form.productId) ?? null
  const totalCost = form.quantityUnits > 0 && form.costPricePerUnit > 0
    ? form.quantityUnits * form.costPricePerUnit
    : null

  const validate = () => {
    if (!form.productId) return 'Select a product'
    if (!form.quantityUnits || form.quantityUnits < 1) return 'Quantity must be at least 1'
    if (!form.costPricePerUnit || form.costPricePerUnit <= 0) return 'Enter a valid cost price'
    if (!form.deliveryDate) return 'Delivery date is required'
    return null
  }

  const handleReview = () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setStep('review')
  }

  const handleSubmit = () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    deliveryMutation.mutate({
      productId: form.productId as number,
      req: {
        quantityUnits: form.quantityUnits,
        costPricePerUnit: form.costPricePerUnit,
        deliveryDate: form.deliveryDate,
        invoiceReference: form.invoiceReference?.trim() || undefined,
      },
    })
  }

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
    <div className="ui-modal-backdrop px-4">
      <div className="ui-modal-panel w-full max-w-md">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">{step === 'form' ? 'Record Stock Delivery' : 'Review Stock Delivery'}</h3>
            <p className="ui-modal-subtitle">
              {step === 'form'
                ? 'Capture incoming stock with cost and bill details.'
                : 'Review the stock delivery before submitting it.'}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {step === 'form' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div role="alert" className="ui-alert ui-alert-danger text-sm">{error} Go back to modify the data and try again.</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <span className="ui-label">Product *</span>
                <SearchableSelect label="Product"
                  value={form.productId ? form.productId.toString() : ''}
                  onChange={v => setForm(f => ({ ...f, productId: v ? parseInt(v) : '' }))}
                  placeholder="Select product…"
                  options={products.map(p => ({ value: p.id.toString(), label: `${p.displayName} (stock: ${p.currentStockUnits})` }))}
                />
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
              <div>
                <label className="block">
                  <span className="ui-label">Cost Price per Unit (₹) *</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="text-sm"
                    value={form.costPricePerUnit || ''}
                    onChange={e => setForm(f => ({ ...f, costPricePerUnit: parseFloat(e.target.value) || 0 }))}
                    placeholder="₹"
                  />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="ui-label">Delivery Date *</span>
                  <input
                    type="date"
                    className="text-sm"
                    value={form.deliveryDate}
                    onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))}
                  />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="ui-label">Invoice Reference</span>
                  <input
                    className="text-sm"
                    value={form.invoiceReference ?? ''}
                    onChange={e => setForm(f => ({ ...f, invoiceReference: e.target.value }))}
                    placeholder="Optional"
                  />
                </label>
              </div>
            </div>

            {totalCost != null && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-blue-600">Estimated Total</span>
                <span className="text-sm font-semibold text-blue-700">{fmtCurrency(totalCost)}</span>
              </div>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div role="alert" className="ui-alert ui-alert-danger text-sm">{error} Go back to modify the data and try again.</div>
            )}
            <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
              <ReviewRow label="Product" value={selectedProduct?.displayName ?? '—'} />
              <ReviewRow label="Quantity" value={`${form.quantityUnits} unit${form.quantityUnits !== 1 ? 's' : ''}`} />
              <ReviewRow label="Cost Price / Unit" value={fmtCurrency(form.costPricePerUnit)} />
              <ReviewRow label="Delivery Date" value={fmtDate(form.deliveryDate)} />
              <ReviewRow label="Invoice Reference" value={form.invoiceReference?.trim() || '—'} />
              <ReviewRow label="Total Cost" value={fmtCurrency(totalCost)} highlight />
            </div>
          </div>
        )}

        <div className="ui-modal-footer">
          {step === 'form' ? (
            <>
              <button onClick={onClose} className="ui-btn ui-btn-secondary">
                Cancel
              </button>
              <button onClick={handleReview} className="ui-btn ui-btn-primary">
                Review
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('form'); setError(null) }}
                className="ui-btn ui-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={deliveryMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {deliveryMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Recording…</span> : 'Confirm Delivery'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
