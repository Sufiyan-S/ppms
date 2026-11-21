import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient, RecordPaymentRequest } from '../../../api/creditApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { localDateInputValue } from '../../../utils/date'
import { Spinner } from '../../../components/Spinner'
import { useToastStore } from '../../../store/toastStore'
import { ModalPortal } from '../../../components/ModalPortal'
import { parseApiError } from '../../../utils/apiError'

// ─── Record Payment Modal ────────────────────────────────────────────────────

interface RecordPaymentModalProps {
  client: CreditClient
  pumpId: number
  outstandingBalanceOverride?: number
  subClients?: CreditClient[]
  onClose: () => void
}

export function RecordPaymentModal({ client, pumpId, outstandingBalanceOverride, subClients = [], onClose }: RecordPaymentModalProps) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [amount, setAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER'>('CASH')
  const [paidAt, setPaidAt] = useState(() => localDateInputValue())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [targetClientId, setTargetClientId] = useState<number>(client.id)

  const targetClient = targetClientId === client.id
    ? client
    : (subClients.find(c => c.id === targetClientId) ?? client)

  const outstandingBalance = targetClientId === client.id
    ? (outstandingBalanceOverride ?? client.outstandingBalance)
    : (targetClient.outstandingBalance ?? 0)

  const mutation = useMutation({
    mutationFn: (req: RecordPaymentRequest) =>
      creditApi.recordPayment(pumpId, targetClientId, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
      qc.invalidateQueries({ queryKey: ['credit-transactions', pumpId, client.id] })
      if (targetClientId !== client.id) {
        qc.invalidateQueries({ queryKey: ['credit-transactions', pumpId, targetClientId] })
      }
      addToast(`Payment recorded for ${targetClient.name}`, 'success')
      onClose()
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to record payment')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const handleSubmit = () => {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) {
      setError('Please enter a valid amount')
      return
    }
    if (amt > outstandingBalance) {
      setError(`Amount cannot exceed outstanding balance (₹${outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })})`)
      return
    }
    setError(null)
    mutation.mutate({ amount: amt, paymentMode, paidAt, notes: notes.trim() || undefined })
  }

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--success">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Record Payment</h2>
            <p className="ui-modal-subtitle">{client.name}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        <div className="ui-modal-body space-y-4">
          {subClients.length > 0 && (
            <div className="ui-inline-form">
              <span className="ui-label">Record Payment For</span>
              <SearchableSelect label="Record Payment For"
                value={String(targetClientId)}
                onChange={v => { setTargetClientId(Number(v)); setAmount(''); setError(null) }}
                options={[
                  { value: String(client.id), label: `${client.name} (Parent)` },
                  ...subClients.map(c => ({ value: String(c.id), label: c.name })),
                ]}
              />
            </div>
          )}

          {/* Outstanding + Remaining live feedback */}
          <div className="ui-card p-0 overflow-hidden border-amber-200">
            <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-amber-700">Outstanding Balance</span>
                <span className="text-base font-bold text-amber-800">
                ₹{outstandingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            {amount !== '' && (() => {
              const amt = parseFloat(amount) || 0
              const remaining = outstandingBalance - amt
              return (
                <div className={`px-4 py-2.5 flex items-center justify-between border-t ${
                  remaining >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-100'
                }`}>
                  <span className={`text-sm ${remaining >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    Remaining after payment
                  </span>
                  <span className={`text-sm font-bold ${remaining >= 0 ? 'text-green-800' : 'text-red-700'}`}>
                    ₹{Math.abs(remaining).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    {remaining < 0 ? ' (over)' : ''}
                  </span>
                </div>
              )
            })()}
          </div>

          <div className="ui-inline-form">
            <span className="ui-label">
              Amount <span className="text-red-500">*</span>
            </span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">₹</span>
              <input aria-label="Amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                data-autofocus
                className="pl-7 pr-3 shadow-sm"
              />
            </div>
          </div>

          <div className="ui-inline-form">
            <span className="ui-label">
              Payment Mode <span className="text-red-500">*</span>
            </span>
            <SearchableSelect label="Payment Mode"
              value={paymentMode}
              onChange={v => setPaymentMode(v as typeof paymentMode)}
              options={[
                { value: 'CASH',          label: 'Cash' },
                { value: 'UPI',           label: 'UPI' },
                { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                { value: 'OTHER',         label: 'Other' },
              ]}
            />
          </div>

          <div className="ui-inline-form">
            <label className="block">
              <span className="ui-label">
              Payment Date <span className="text-red-500">*</span>
            </span>
              <input
                type="date"
                value={paidAt}
                onChange={e => setPaidAt(e.target.value)}
                className="shadow-sm"
              />
            </label>
          </div>

          <div className="ui-inline-form">
            <label className="block">
              <span className="ui-label">Notes</span>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Paid via NEFT ref TXN12345"
                className="shadow-sm"
              />
            </label>
          </div>

          {error && (
            <div role="alert" className="ui-alert ui-alert-danger text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="ui-btn ui-btn-primary"
          >
            {mutation.isPending
              ? <span className="flex items-center gap-1.5"><Spinner />Saving…</span>
              : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
