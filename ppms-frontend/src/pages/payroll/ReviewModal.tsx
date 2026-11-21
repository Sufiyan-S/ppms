import { useState } from 'react'
import { withToggled } from '../../utils/setToggle'
import { useQuery } from '@tanstack/react-query'
import type { StaffMember } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { GeneratePayrollRequest, PendingDiscrepancy } from '../../api/payrollApi'
import { Spinner } from '../../components/Spinner'
import { ModalPortal } from '../../components/ModalPortal'
import { fmtAmt, fmtDate } from './payrollFormat'

// ── Review + Discrepancy Modal ────────────────────────────────────────────────

interface ReviewModalProps {
  form: GeneratePayrollRequest
  selectedStaff: StaffMember | undefined
  pumpId: number
  formError: string | null
  isPending: boolean
  onClose: () => void
  onGenerate: (deductIds: number[]) => void
}

export function ReviewModal({ form, selectedStaff, pumpId, formError, isPending, onClose, onGenerate }: ReviewModalProps) {
  const [deductSet, setDeductSet] = useState<Set<number>>(new Set())

  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-discrepancies', pumpId, form.userId],
    queryFn: () => payrollApi.getPendingDiscrepancies(pumpId, form.userId),
    enabled: form.userId > 0,
  })

  const toggleDeduct = (id: number) =>
    setDeductSet(prev => withToggled(prev, id))

  const totalDeductAmt = pending
    .filter(d => deductSet.has(d.id))
    .reduce((s, d) => s + d.discrepancyAmount, 0)

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-lg">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Review Payroll</h2>
            <p className="ui-modal-subtitle">Verify the details and handle any pending discrepancies.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        <div className="ui-modal-body space-y-4">
          {formError && (
            <div role="alert" className="ui-alert ui-alert-danger text-sm">{formError} Go back to modify the data and try again.</div>
          )}

          {/* Summary */}
          <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-slate-500 text-xs">Staff Member</span>
              <span className="font-medium text-slate-800">{selectedStaff ? `${selectedStaff.fullName} — ${selectedStaff.role}` : '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-slate-500 text-xs">Period</span>
              <span className="font-medium text-slate-800">{fmtDate(form.periodFrom)} – {fmtDate(form.periodTo)}</span>
            </div>
            {form.notes?.trim() && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-slate-500 text-xs">Notes</span>
                <span className="font-medium text-slate-800">{form.notes}</span>
              </div>
            )}
          </div>

          {/* Pending discrepancies */}
          {pendingLoading ? (
            <div className="text-xs text-slate-500 px-1">Checking pending discrepancies…</div>
          ) : pending.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Pending Discrepancies ({pending.length})
                </p>
                <p className="text-xs text-slate-500">Toggle to deduct from this salary</p>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {pending.map((d: PendingDiscrepancy) => {
                  const isDeduct = deductSet.has(d.id)
                  return (
                    <div
                      key={d.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${isDeduct ? 'bg-red-50/60' : 'bg-white hover:bg-slate-50'}`}
                    >
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-slate-500">#{d.id}</span>
                          <span className="text-xs text-slate-600">{d.shiftDate}</span>
                          {(d.duName || d.duNumber != null) && (
                            <span className="text-xs text-slate-500">{d.duName ?? `DU #${d.duNumber}`}</span>
                          )}
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                            d.discrepancyType === 'SHORT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {d.discrepancyType}
                          </span>
                          <span className={`text-xs font-bold ${d.discrepancyType === 'SHORT' ? 'text-red-700' : 'text-amber-700'}`}>
                            {fmtAmt(d.discrepancyAmount)}
                          </span>
                        </div>
                        {d.discrepancyReason && (
                          <p className="text-xs text-slate-500 mt-0.5 italic truncate">{d.discrepancyReason}</p>
                        )}
                      </div>

                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleDeduct(d.id)}
                        className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                          isDeduct
                            ? 'bg-red-600 border-red-600 text-white'
                            : 'border-slate-300 text-slate-600 hover:border-red-400 hover:text-red-600'
                        }`}
                      >
                        {isDeduct ? 'Deduct ✓' : 'Skip'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {deductSet.size > 0 && (
                <div className="mt-2 flex items-center justify-between px-1">
                  <span className="text-xs text-slate-500">{deductSet.size} deduction{deductSet.size !== 1 ? 's' : ''} selected</span>
                  <span className="text-xs font-semibold text-red-700">−{fmtAmt(totalDeductAmt)} from net pay</span>
                </div>
              )}
              {deductSet.size === 0 && (
                <p className="text-xs text-slate-500 mt-1 px-1">All discrepancies set to Skip — they will remain pending for the next payroll run.</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1 text-xs text-emerald-700">
              <span className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-[10px] font-bold shrink-0">✓</span>
              No pending discrepancies for this staff member.
            </div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button onClick={onClose} className="ui-btn ui-btn-secondary">Back</button>
          <button
            onClick={() => onGenerate(Array.from(deductSet))}
            disabled={isPending}
            className="ui-btn ui-btn-primary"
          >
            {isPending
              ? <span className="flex items-center gap-1.5"><Spinner />Generating…</span>
              : 'Generate Payroll'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
