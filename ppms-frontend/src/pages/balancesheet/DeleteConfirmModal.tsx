import { useMutation, useQueryClient } from '@tanstack/react-query'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { parseApiError } from '../../utils/apiError'
import type { BalanceSheetSummary } from '../../api/balanceSheetApi'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { fmtDate } from './bsFormat'

// ── Delete Confirm Modal ────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  report: BalanceSheetSummary
  pumpId: number
  onClose: () => void
}

export function DeleteConfirmModal({ report, pumpId, onClose }: DeleteConfirmProps) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()

  const mutation = useMutation({
    mutationFn: () => balanceSheetApi.delete(pumpId, report.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balance-sheets', pumpId] })
      addToast('Balance sheet deleted', 'success')
      onClose()
    },
    onError: (err) => addToast(parseApiError(err, 'Failed to delete balance sheet'), 'error'),
  })

  return (
    <ModalPortal onClose={onClose}>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-sm">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--danger">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">Delete Balance Sheet?</h3>
            <p className="ui-modal-subtitle">This action removes the saved report entry.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>
        <div className="ui-modal-body">
          <p className="text-sm text-slate-600">
            This will permanently delete the <span className="font-medium">{report.periodLabel}</span> report
            for <span className="font-medium">{fmtDate(report.reportDate)}</span>.
            You can regenerate it afterwards.
          </p>
        </div>
        <div className="ui-modal-footer">
          <button
            onClick={onClose}
            className="ui-btn ui-btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="ui-btn ui-btn-danger"
          >
            {mutation.isPending
              ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Deleting…</span>
              : 'Delete Report'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
