import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Landmark, Check } from 'lucide-react'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { RecordSettlementRequest, SettlementPaymentType, WalletSummary } from '../../api/paymentSettlementApi'
import { ModalPortal } from '../../components/ModalPortal'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { localDateInputValue } from '../../utils/date'
import { parseApiError } from '../../utils/apiError'
import { TYPES, TYPE_ACCENT, TYPE_ICONS, TYPE_LABELS, fmtAmt, getPending } from './settlementFormat'
import { IconButton } from '../../components/IconButton'

interface RecordSettlementDialogProps {
  pumpId: number
  wallet: WalletSummary | undefined
  initialType: SettlementPaymentType
  onClose: () => void
}

export function RecordSettlementDialog({ pumpId, wallet, initialType, onClose }: RecordSettlementDialogProps) {
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm]           = useState<RecordSettlementRequest>({
    paymentType:    initialType,
    settlementDate: localDateInputValue(),
    amountReceived: 0,
    notes:          '',
  })

  const recordMutation = useMutation({
    mutationFn: (data: RecordSettlementRequest) => paymentSettlementApi.record(pumpId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements-daily', pumpId] })
      qc.invalidateQueries({ queryKey: ['settlements-wallet', pumpId] })
      onClose()
      addToast('Settlement recorded successfully', 'success')
    },
    onError: (err) => {
      const msg = parseApiError(err, 'Failed to record settlement')
      setFormError(msg)
    },
  })

  const handleRecord = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form.settlementDate) { setFormError('Settlement date is required'); return }
    if (form.amountReceived <= 0) { setFormError('Amount must be greater than zero'); return }
    recordMutation.mutate({ ...form, notes: form.notes || undefined })
  }

  const pendingAfterRecord = wallet
    ? Math.max(0, getPending(wallet, form.paymentType) - form.amountReceived)
    : null

  return (
    <ModalPortal onClose={() => onClose()} closeOnBackdropClick>
      <div className="ui-modal-backdrop">
        <div className="ui-modal-panel">

          {/* Themed header */}
          <div className="ui-modal-header ui-modal-header--themed ui-modal-header--success">
            <div className="ui-modal-heading">
              <h2 className="ui-modal-title text-white">Record Settlement</h2>
              <p className="ui-modal-subtitle">Enter the amount credited to your bank account</p>
            </div>
            <IconButton label="Close" icon="×" onClick={() => onClose()} className="ui-btn ui-btn-ghost ui-modal-close" />
          </div>

          <form onSubmit={handleRecord} className="ui-modal-body flex flex-col gap-5">

            {/* Payment type pill selector */}
            <div>
              <span className="ui-label mb-2">Payment Type</span>
              <div role="group" aria-label="Payment Type" className="grid grid-cols-3 gap-2">
                {TYPES.map(t => {
                  const accent  = TYPE_ACCENT[t]
                  const active  = form.paymentType === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, paymentType: t }))}
                      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-sm transition-all ${
                        active ? accent.pillActive : accent.pill + ' bg-white'
                      }`}
                    >
                      <span className="leading-none">{TYPE_ICONS[t]}</span>
                      <span>{TYPE_LABELS[t]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Current pending context for selected type */}
            {wallet && (
              <div className={`rounded-xl border px-4 py-3 ${
                getPending(wallet, form.paymentType) > 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {TYPE_LABELS[form.paymentType]} — Current Pending
                  </span>
                  <span className={`text-base font-bold tabular-nums ${
                    getPending(wallet, form.paymentType) > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}>
                    {fmtAmt(getPending(wallet, form.paymentType))}
                  </span>
                </div>
                {form.amountReceived > 0 && pendingAfterRecord !== null && (
                  <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-dashed border-slate-200">
                    <span className="text-xs text-slate-500">After this settlement</span>
                    <span className={`text-sm font-bold tabular-nums ${pendingAfterRecord > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {fmtAmt(pendingAfterRecord)}
                      {pendingAfterRecord <= 0 && <span className="ml-1 inline-flex items-center gap-1 text-xs"><Check size={11} strokeWidth={2.5} />Fully settled</span>}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Date + Amount row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="ui-label">Settlement Date</span>
                <p className="text-[11px] text-slate-500 mb-1.5 -mt-1">Date money arrived in bank</p>
                <input aria-label="Settlement Date"
                  type="date"
                  className="ui-input"
                  value={form.settlementDate}
                  max={localDateInputValue()}
                  onChange={e => setForm(f => ({ ...f, settlementDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <span className="ui-label">Amount Received (₹)</span>
                <p className="text-[11px] text-slate-500 mb-1.5 -mt-1">Bank credit amount</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-semibold text-sm pointer-events-none">₹</span>
                  <input aria-label="Amount Received (₹)"
                    type="number"
                    className="ui-input pl-7"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={form.amountReceived || ''}
                    onChange={e => setForm(f => ({ ...f, amountReceived: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block">
                <span className="ui-label">Notes <span className="text-slate-500 font-normal">(optional)</span></span>
                <input
                  type="text"
                  className="ui-input"
                  placeholder="e.g., Partial credit from yesterday's UPI batch"
                  value={form.notes ?? ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </label>
            </div>

            {/* Error */}
            {formError && (
              <div role="alert" className="ui-alert ui-alert-danger text-sm py-2">
                {formError}
              </div>
            )}

            {/* Footer */}
            <div className="ui-modal-footer mt-2">
              <button
                type="button"
                onClick={() => onClose()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm
                           text-slate-600 bg-slate-100 border border-slate-200
                           hover:bg-slate-200 hover:text-slate-800
                           active:scale-[0.97] transition-all duration-150"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={recordMutation.isPending}
                className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-semibold text-sm text-white
                           bg-gradient-to-b from-emerald-500 to-emerald-600
                           shadow-md shadow-emerald-600/30
                           hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lg hover:shadow-emerald-600/40
                           active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                           transition-all duration-150"
              >
                {recordMutation.isPending
                  ? <><Spinner /><span>Saving…</span></>
                  : <><Landmark size={16} strokeWidth={2} /><span>Record Settlement</span></>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  )
}
