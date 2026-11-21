import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { CreateProductRequest, UnitOfMeasure } from '../../api/ancillaryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { ReviewRow } from './ReviewRow'
import { UNITS } from './ancillaryFormat'

export function AddProductDialog({
  pumpId, onClose, onSuccess,
}: {
  pumpId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const { addToast } = useToastStore()
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<CreateProductRequest>({
    name: '', brand: '', variant: '',
    packageSize: 1, unitOfMeasure: 'PIECE',
  })
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: CreateProductRequest) => ancillaryApi.createProduct(pumpId, data),
    onSuccess: () => {
      addToast('Product created successfully', 'success')
      onSuccess()
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to create product')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const normalizedName = form.name.trim()
  const normalizedBrand = form.brand?.trim() || undefined
  const normalizedVariant = form.variant?.trim() || undefined
  const normalizedThreshold = form.lowStockThreshold && form.lowStockThreshold > 0 ? form.lowStockThreshold : undefined

  const validate = () => {
    if (!normalizedName) return 'Product name is required'
    if (!form.packageSize || form.packageSize <= 0) return 'Package size must be greater than 0'
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

  const handleCreate = () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    createMutation.mutate({
      name: normalizedName,
      brand: normalizedBrand,
      variant: normalizedVariant,
      packageSize: form.packageSize,
      unitOfMeasure: form.unitOfMeasure,
      lowStockThreshold: normalizedThreshold,
    })
  }

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
    <div className="ui-modal-backdrop px-4">
      <div className="ui-modal-panel w-full max-w-md">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">{step === 'form' ? 'Add Product' : 'Review Product'}</h3>
            <p className="ui-modal-subtitle">
              {step === 'form'
                ? 'Create a new counter product with stock alert settings.'
                : 'Review the product details before creating it.'}
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
              <div>
                <label className="block">
                  <span className="ui-label">Product Name *</span>
                  <input
                    className="text-sm"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Engine Oil"
                    data-autofocus
                  />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="ui-label">Brand</span>
                  <input
                    className="text-sm"
                    value={form.brand ?? ''}
                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    placeholder="e.g. Castrol"
                  />
                </label>
              </div>
              <div>
                <label className="block">
                  <span className="ui-label">Variant</span>
                  <input
                    className="text-sm"
                    value={form.variant ?? ''}
                    onChange={e => setForm(f => ({ ...f, variant: e.target.value }))}
                    placeholder="e.g. GTX 10W-40"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block">
                    <span className="ui-label">Package Size *</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      className="text-sm"
                      value={form.packageSize}
                      onChange={e => setForm(f => ({ ...f, packageSize: parseFloat(e.target.value) || 0 }))}
                    />
                  </label>
                </div>
                <div className="w-[132px]">
                  <span className="ui-label">Unit *</span>
                  <SearchableSelect label="Unit"
                    value={form.unitOfMeasure}
                    onChange={v => setForm(f => ({ ...f, unitOfMeasure: v as UnitOfMeasure }))}
                    options={UNITS.map(u => ({ value: u, label: u }))}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block">
                  <span className="ui-label">Low Stock Alert (units)</span>
                  <input
                    type="number"
                    min="0"
                    className="text-sm"
                    value={form.lowStockThreshold ?? ''}
                    onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value ? parseInt(e.target.value) : undefined }))}
                    placeholder="Leave blank to disable"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}
            <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
              <ReviewRow label="Product Name" value={normalizedName} />
              <ReviewRow label="Brand" value={normalizedBrand ?? '—'} />
              <ReviewRow label="Variant" value={normalizedVariant ?? '—'} />
              <ReviewRow label="Package Size" value={String(form.packageSize)} />
              <ReviewRow label="Unit" value={form.unitOfMeasure} />
              <ReviewRow label="Low Stock Alert" value={normalizedThreshold != null ? `${normalizedThreshold} units` : 'Disabled'} />
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
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {createMutation.isPending
                  ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Creating…</span>
                  : 'Create Product'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
