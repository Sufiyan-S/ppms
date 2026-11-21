import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { Settlement } from '../../api/paymentSettlementApi'
import { ModalPortal } from '../../components/ModalPortal'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { TYPE_LABELS, fmtAmt, fmtDate } from './settlementFormat'
import { IconButton } from '../../components/IconButton'

interface VoidSettlementDialogProps {
  pumpId: number
  voidTarget: Settlement
  onClose: () => void
}

export function VoidSettlementDialog({ pumpId, voidTarget, onClose }: VoidSettlementDialogProps) {
  const qc           = useQueryClient()
  const { addToast } = useToastStore()
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError]   = useState<string | null>(null)

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      paymentSettlementApi.voidSettlement(pumpId, id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements-daily', pumpId] })
      qc.invalidateQueries({ queryKey: ['settlements-wallet', pumpId] })
      onClose()
      addToast('Settlement voided', 'success')
    },
    onError: (err) => setVoidError(parseApiError(err, 'Failed to void settlement')),
  })

  const handleVoid = (e: React.FormEvent) => {
    e.preventDefault()
    if (!voidReason.trim()) { setVoidError('A reason is required'); return }
    voidMutation.mutate({ id: voidTarget.id, reason: voidReason.trim() })
  }

  return (
    <ModalPortal onClose={() => onClose()} closeOnBackdropClick>
      <div className="ui-modal-backdrop">
        <div className="ui-modal-panel">
          <div className="ui-modal-header">
            <div className="ui-modal-heading">
              <h2 className="ui-modal-title">Void Settlement</h2>
              <p className="ui-modal-subtitle">
                {TYPE_LABELS[voidTarget.paymentType]} · {fmtDate(voidTarget.settlementDate)} · {fmtAmt(voidTarget.amountReceived)}
              </p>
            </div>
            <IconButton label="Close" icon="×" onClick={() => onClose()} className="ui-btn ui-btn-ghost ui-modal-close" />
          </div>

          <form onSubmit={handleVoid} className="ui-modal-body flex flex-col gap-5">
            <p className="text-sm text-slate-600">
              The settlement stays on record but no longer counts as received, so the pending balance goes back up.
            </p>
            <div>
              <label className="block">
                <span className="ui-label">Reason</span>
                <input
                  type="text"
                  className="ui-input"
                  placeholder="e.g., Recorded twice by mistake"
                  value={voidReason}
                  onChange={e => setVoidReason(e.target.value)}
                  data-autofocus
                />
              </label>
            </div>

            {voidError && (
              <div role="alert" className="ui-alert ui-alert-danger text-sm py-2">
                {voidError}
              </div>
            )}

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
                disabled={voidMutation.isPending}
                className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-semibold text-sm text-white
                           bg-red-600 hover:bg-red-700
                           active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-150"
              >
                {voidMutation.isPending ? <><Spinner /><span>Voiding…</span></> : <span>Void Settlement</span>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  )
}
