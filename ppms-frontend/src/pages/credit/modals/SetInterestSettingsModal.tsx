import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient, UpdateInterestSettingsRequest } from '../../../api/creditApi'
import { Spinner } from '../../../components/Spinner'
import { ModalPortal } from '../../../components/ModalPortal'
import { parseApiError } from '../../../utils/apiError'

// ─── Set Interest Settings Modal ─────────────────────────────────────────────

interface SetInterestSettingsModalProps {
  client: CreditClient
  pumpId: number
  onClose: () => void
}

export function SetInterestSettingsModal({ client, pumpId, onClose }: SetInterestSettingsModalProps) {
  const qc = useQueryClient()
  const [rate, setRate] = useState(client.monthlyInterestRate > 0 ? String(client.monthlyInterestRate) : '')
  const [graceDays, setGraceDays] = useState(String(client.interestGraceDays ?? 1))
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (req: UpdateInterestSettingsRequest) =>
      creditApi.updateInterestSettings(pumpId, client.id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
      onClose()
    },
    onError: (err) => setError(parseApiError(err, 'Failed to update interest settings')),
  })

  const handleSubmit = () => {
    const r = rate.trim() === '' ? 0 : parseFloat(rate)
    const g = parseInt(graceDays, 10)
    if (isNaN(r) || r < 0 || r > 100) { setError('Rate must be between 0 and 100'); return }
    if (isNaN(g) || g < 0) { setError('Grace days must be 0 or more'); return }
    setError(null)
    mutation.mutate({ monthlyInterestRate: r, interestGraceDays: g })
  }

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-sm">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Interest Settings</h2>
            <p className="ui-modal-subtitle">{client.name}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        <div className="ui-modal-body space-y-4">
          <div className="ui-inline-form">
            <p className="ui-inline-form__copy">
              Simple interest is calculated as: <strong>outstanding × rate × (days / 30)</strong>.
              Set rate to <strong>0</strong> to disable interest for this client.
            </p>

            <span className="ui-label">Monthly Interest Rate (%)</span>
            <div className="relative">
              <input aria-label="Monthly Interest Rate (%)"
                type="number" min="0" max="100" step="0.01"
                value={rate}
                onChange={e => setRate(e.target.value)}
                placeholder="0 = no interest"
                className="w-full pr-8 pl-3 text-sm"
                data-autofocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              e.g. 2% means ₹100 outstanding → ₹2 interest per month
            </p>
          </div>

          <div className="ui-inline-form">
            <label className="block">
              <span className="ui-label">Grace Period (days)</span>
              <input
                type="number" min="0" step="1"
                value={graceDays}
                onChange={e => setGraceDays(e.target.value)}
                className="text-sm"
              />
            </label>
            <p className="text-xs text-slate-500 mt-1">
              Interest starts this many days after the first credit sale. Default is 1.
            </p>
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
            {mutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Saving…</span> : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
