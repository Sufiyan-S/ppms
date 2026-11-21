import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pumpApi } from '../../../api/pumpApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Spinner } from '../../../components/Spinner'
import { ModalPortal } from '../../../components/ModalPortal'
import { parseApiError } from '../../../utils/apiError'

// ─── Reassign Credit Entry Modal ─────────────────────────────────────────────

interface ReassignModalProps {
  entryId: number
  currentClientId: number
  pumpId: number
  transactionType: 'SALE' | 'PAYMENT'
  onClose: () => void
}

export function ReassignCreditEntryModal({ entryId, currentClientId, pumpId, transactionType, onClose }: ReassignModalProps) {
  const qc = useQueryClient()
  const [toClientId, setToClientId] = useState<string>('')
  const [reason, setReason]         = useState('')
  const [error, setError]           = useState<string | null>(null)

  const { data: allClients = [] } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn:  () => pumpApi.getCreditClients(pumpId),
  })

  // Restrict targets to within the same parent/child group only:
  // • Parent account   → can move only to its own sub-accounts
  // • Sub-account      → can move to its parent OR sibling sub-accounts
  // • Standalone       → no valid targets (no group to move within)
  const currentClient = allClients.find(c => c.id === currentClientId)

  let targets: typeof allClients = []
  let noTargetsReason: string | null = null

  if (currentClient?.isParent) {
    targets = allClients.filter(c => c.parentClientId === currentClientId)
    if (targets.length === 0) {
      noTargetsReason = 'This account has no sub-accounts yet. Add sub-accounts in Setup first.'
    }
  } else if (currentClient?.parentClientId !== null && currentClient?.parentClientId !== undefined) {
    targets = allClients.filter(c =>
      c.id !== currentClientId &&
      (c.id === currentClient.parentClientId || c.parentClientId === currentClient.parentClientId)
    )
  } else {
    noTargetsReason = 'Entries can only be moved within a parent / sub-account group. This is a standalone account with no group.'
  }

  const mutation = useMutation({
    mutationFn: ({ toId, rsn }: { toId: number; rsn: string }) =>
      transactionType === 'PAYMENT'
        ? pumpApi.reassignCreditPayment(pumpId, entryId, toId, rsn)
        : pumpApi.reassignCreditEntry(pumpId, entryId, toId, rsn),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
      qc.invalidateQueries({ queryKey: ['credit-transactions', pumpId] })
      onClose()
    },
    onError: (err) => setError(parseApiError(err, `Failed to move ${transactionType === 'PAYMENT' ? 'payment' : 'entry'}`)),
  })

  const handleSubmit = () => {
    if (!toClientId)        { setError('Select a target client'); return }
    if (!reason.trim())     { setError('Reason is required'); return }
    setError(null)
    mutation.mutate({ toId: Number(toClientId), rsn: reason.trim() })
  }

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-sm">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Move Credit Entry</h2>
            <p className="ui-modal-subtitle">
              {transactionType === 'PAYMENT'
                ? 'Reassign this payment within the same account group.'
                : 'Reassign this sale entry within the same account group.'}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>
        <div className="ui-modal-body space-y-4">
          {noTargetsReason ? (
            <div className="ui-alert ui-alert-warning">
              <p className="text-sm text-amber-800">{noTargetsReason}</p>
            </div>
          ) : (
            <>
              <div className="ui-inline-form">
                <span className="ui-label">
                  Move to <span className="text-red-500">*</span>
                </span>
                <SearchableSelect label="Move to"
                  value={toClientId}
                  onChange={setToClientId}
                  placeholder="Search and select account…"
                  searchThreshold={0}
                  options={targets.map(c => ({
                    value: String(c.id),
                    label: c.parentClientId === null ? `${c.name} (parent)` : c.name,
                  }))}
                />
              </div>
              <div className="ui-inline-form">
                <label className="block">
                  <span className="ui-label">
                  Reason <span className="text-red-500">*</span>
                </span>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    placeholder={transactionType === 'PAYMENT'
                      ? 'e.g. Payment was recorded under parent but belongs to sub-account'
                      : 'e.g. Entry was logged under parent but belongs to sub-account'}
                    className="resize-none text-sm"
                  />
                </label>
              </div>
              {error && <p role="alert" className="ui-error-text text-sm">{error}</p>}
            </>
          )}
        </div>
        <div className="ui-modal-footer">
          <button onClick={onClose}
            className="ui-btn ui-btn-secondary flex-1">
            {noTargetsReason ? 'Close' : 'Cancel'}
          </button>
          {!noTargetsReason && (
            <button onClick={handleSubmit} disabled={mutation.isPending}
              className="ui-btn ui-btn-primary flex-1">
              {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Moving…</span> : 'Move Entry'}
            </button>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
