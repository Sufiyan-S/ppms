import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { creditApi } from '../../../api/creditApi'
import type { GenerateAllInvoicesResult } from '../../../api/creditApi'
import { Spinner } from '../../../components/Spinner'
import { ModalPortal } from '../../../components/ModalPortal'
import { parseApiError } from '../../../utils/apiError'
import { lastCompletedMonth } from '../creditDates'

// ─── Generate Invoices For All Clients Modal ─────────────────────────────────

interface GenerateAllInvoicesModalProps {
  pumpId: number
  onClose: () => void
}

export function GenerateAllInvoicesModal({ pumpId, onClose }: GenerateAllInvoicesModalProps) {
  const qc = useQueryClient()
  const [periodFrom, setPeriodFrom] = useState(() => lastCompletedMonth().periodFrom)
  const [periodTo, setPeriodTo] = useState(() => lastCompletedMonth().periodTo)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateAllInvoicesResult | null>(null)

  const mutation = useMutation({
    mutationFn: () => creditApi.generateInvoicesForAllClients(pumpId, { periodFrom, periodTo }),
    onSuccess: (runResult) => {
      qc.invalidateQueries({ queryKey: ['credit-invoices', pumpId] })
      setResult(runResult)
    },
    onError: (err) => setError(parseApiError(err, 'Failed to generate invoices')),
  })

  const handleSubmit = () => {
    if (!periodFrom || !periodTo) { setError('Choose both dates of the period.'); return }
    if (periodFrom > periodTo) { setError('The period start must be on or before its end.'); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <ModalPortal onClose={mutation.isPending ? undefined : onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-md">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Generate Invoices</h2>
            <p className="ui-modal-subtitle">One invoice per client with uninvoiced credit sales</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        <div className="ui-modal-body space-y-4">
          {result ? (
            <div role="status" className="ui-alert text-sm bg-emerald-50 border-emerald-200 text-emerald-800 space-y-1">
              <p><strong>{result.invoicesIssued}</strong> invoice{result.invoicesIssued !== 1 ? 's' : ''} issued.</p>
              <p>{result.clientsSkipped} client{result.clientsSkipped !== 1 ? 's' : ''} had nothing to bill.</p>
              {result.clientsFailed > 0 && (
                <p className="text-red-700">{result.clientsFailed} client{result.clientsFailed !== 1 ? 's' : ''} failed — try them one by one from the client screen.</p>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Clients with nothing to bill in the period are skipped. Interest is not included.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="ui-label">From</span>
                  <input type="date" value={periodFrom} max={periodTo || undefined}
                    onChange={e => setPeriodFrom(e.target.value)} className="text-sm" data-autofocus />
                </label>
                <label className="block">
                  <span className="ui-label">To</span>
                  <input type="date" value={periodTo} min={periodFrom || undefined}
                    onChange={e => setPeriodTo(e.target.value)} className="text-sm" />
                </label>
              </div>
              {error && <div role="alert" className="ui-alert ui-alert-danger text-sm">{error}</div>}
            </>
          )}
        </div>

        <div className="ui-modal-footer">
          {result ? (
            <button onClick={onClose} className="ui-btn ui-btn-primary">Done</button>
          ) : (
            <>
              <button onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
              <button onClick={handleSubmit} disabled={mutation.isPending} className="ui-btn ui-btn-primary">
                {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Generating…</span> : 'Generate'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
