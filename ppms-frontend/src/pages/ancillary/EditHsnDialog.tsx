import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { Spinner } from '../../components/Spinner'
import { ModalPortal } from '../../components/ModalPortal'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { isValidHsnCode } from '../../utils/gst'

export function EditHsnDialog({
  pumpId, product, onClose, onSuccess,
}: {
  pumpId: number
  product: AncillaryProduct
  onClose: () => void
  onSuccess: () => void
}) {
  const { addToast } = useToastStore()
  const [hsnCode, setHsnCode] = useState(product.hsnCode ?? '')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => ancillaryApi.updateProduct(pumpId, product.id, { hsnCode: hsnCode.trim() }),
    onSuccess: () => {
      addToast('HSN code saved', 'success')
      onSuccess()
    },
    onError: (err) => setError(parseApiError(err, 'Failed to save HSN code')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidHsnCode(hsnCode)) { setError('HSN code must be 4 to 8 digits'); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <ModalPortal onClose={mutation.isPending ? undefined : onClose} closeOnBackdropClick>
    <div className="ui-modal-backdrop px-4">
      <form onSubmit={handleSubmit} className="ui-modal-panel w-full max-w-sm">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">HSN Code</h3>
            <p className="ui-modal-subtitle">{product.displayName}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        <div className="ui-modal-body space-y-3">
          <label className="block">
            <span className="ui-label">HSN Code</span>
            <input
              className="text-sm"
              inputMode="numeric"
              maxLength={8}
              value={hsnCode}
              onChange={e => setHsnCode(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 27101980 — leave blank to remove"
              data-autofocus
            />
          </label>
          <p className="text-xs text-slate-500">Printed on tax invoices for credit sales of this product.</p>
          {error && <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>}
        </div>

        <div className="ui-modal-footer">
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="ui-btn ui-btn-primary">
            {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Saving…</span> : 'Save'}
          </button>
        </div>
      </form>
    </div>
    </ModalPortal>
  )
}
