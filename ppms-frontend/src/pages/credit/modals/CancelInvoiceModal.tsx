import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { creditApi } from '../../../api/creditApi'
import type { CreditInvoice } from '../../../api/creditApi'
import { Spinner } from '../../../components/Spinner'
import { ModalPortal } from '../../../components/ModalPortal'
import { parseApiError } from '../../../utils/apiError'
import { useToastStore } from '../../../store/toastStore'

// ─── Cancel Invoice Modal ────────────────────────────────────────────────────

interface CancelInvoiceModalProps {
  invoice: CreditInvoice
  pumpId: number
  onClose: () => void
}

export function CancelInvoiceModal({ invoice, pumpId, onClose }: CancelInvoiceModalProps) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => creditApi.cancelInvoice(pumpId, invoice.id, reason.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-invoices', pumpId] })
      addToast(`Invoice ${invoice.invoiceNumber} cancelled`, 'success')
      onClose()
    },
    onError: (err) => setError(parseApiError(err, 'Failed to cancel invoice')),
  })

  const handleSubmit = () => {
    if (!reason.trim()) { setError('A reason is required to cancel an invoice'); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <ModalPortal onClose={mutation.isPending ? undefined : onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-md">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Cancel Invoice</h2>
            <p className="ui-modal-subtitle">{invoice.invoiceNumber}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        <div className="ui-modal-body space-y-4">
          <p className="text-sm text-slate-600">
            The invoice stays on record marked as cancelled and its number is not reused.
            Its sales can then be put on a new invoice.
          </p>
          <div className="ui-inline-form">
            <label className="block">
              <span className="ui-label">Reason <span className="text-red-500">*</span></span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. Issued for the wrong period"
                className="resize-none text-sm"
                data-autofocus
              />
            </label>
          </div>
          {error && <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>}
        </div>

        <div className="ui-modal-footer">
          <button onClick={onClose} className="ui-btn ui-btn-secondary">Keep Invoice</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="ui-btn ui-btn-danger">
            {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Cancelling…</span> : 'Cancel Invoice'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
