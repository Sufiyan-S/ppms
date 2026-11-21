import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient, CreateExtensionRequest, CreditExtensionType } from '../../../api/creditApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { localDateInputValue } from '../../../utils/date'
import { Spinner } from '../../../components/Spinner'
import { ModalPortal } from '../../../components/ModalPortal'
import { parseApiError } from '../../../utils/apiError'

// ─── Grant Extension Modal ───────────────────────────────────────────────────

interface GrantExtensionModalProps {
  client: CreditClient
  pumpId: number
  onClose: () => void
}

const EXTENSION_TYPE_OPTIONS = [
  { value: 'AMOUNT_EXTENSION',       label: 'Amount Extension — extra credit headroom' },
  { value: 'BILLING_CYCLE_EXTENSION', label: 'Billing Cycle Extension — defer overdue block' },
  { value: 'OVERDUE_BLOCK_WAIVER',   label: 'Overdue Block Waiver — one-time waiver' },
]

export function GrantExtensionModal({ client, pumpId, onClose }: GrantExtensionModalProps) {
  const qc = useQueryClient()
  const [extensionType, setExtensionType] = useState<CreditExtensionType>('BILLING_CYCLE_EXTENSION')
  const [extensionAmount, setExtensionAmount] = useState('')
  const [expiryDate, setExpiryDate] = useState(() => localDateInputValue())
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Minimum expiry = tomorrow
  const minDate = localDateInputValue(1)

  const mutation = useMutation({
    mutationFn: (req: CreateExtensionRequest) =>
      creditApi.createExtension(pumpId, client.id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-extensions', pumpId, client.id] })
      onClose()
    },
    onError: (err) => setError(parseApiError(err, 'Failed to create extension')),
  })

  const handleSubmit = () => {
    if (!expiryDate) { setError('Expiry date is required'); return }
    if (!reason.trim()) { setError('A reason is required'); return }
    if (extensionType === 'AMOUNT_EXTENSION') {
      const amt = parseFloat(extensionAmount)
      if (!extensionAmount || isNaN(amt) || amt <= 0) { setError('A positive amount is required for Amount Extension'); return }
    }
    setError(null)
    mutation.mutate({
      extensionType,
      extensionAmount: extensionType === 'AMOUNT_EXTENSION' ? parseFloat(extensionAmount) : undefined,
      expiryDate,
      reason: reason.trim(),
    })
  }

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel ui-modal-panel--lg w-full max-w-md">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Grant Credit Extension</h2>
            <p className="ui-modal-subtitle">{client.name}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        <div className="ui-modal-body space-y-4">
          <div className="ui-inline-form">
            <span className="ui-label">Extension Type</span>
            <SearchableSelect label="Extension Type"
              value={extensionType}
              onChange={(v) => setExtensionType(v as CreditExtensionType)}
              options={EXTENSION_TYPE_OPTIONS}
            />
          </div>

          {extensionType === 'AMOUNT_EXTENSION' && (
            <div className="ui-inline-form">
              <label className="block">
                <span className="ui-label">
                Additional Credit Amount (₹) <span className="text-red-500">*</span>
              </span>
                <input
                  type="number" min="1" step="0.01"
                  value={extensionAmount}
                  onChange={(e) => setExtensionAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="text-sm"
                />
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Current limit: {client.creditLimit > 0 ? `₹${client.creditLimit.toLocaleString('en-IN')}` : 'Unlimited'}
              </p>
            </div>
          )}

          <div className="ui-inline-form">
            <label className="block">
              <span className="ui-label">
              Expires On <span className="text-red-500">*</span>
            </span>
              <input
                type="date" min={minDate}
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="text-sm"
              />
            </label>
          </div>

          <div className="ui-inline-form">
            <label className="block">
              <span className="ui-label">
              Reason / Justification <span className="text-red-500">*</span>
            </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why is this extension being granted?"
                className="resize-none text-sm"
                data-autofocus
              />
            </label>
          </div>

          {error && (
            <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button onClick={onClose} className="ui-btn ui-btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="ui-btn ui-btn-primary"
          >
            {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Granting…</span> : 'Grant Extension'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
