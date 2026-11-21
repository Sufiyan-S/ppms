import { useState } from 'react'
import { Printer } from 'lucide-react'
import { useAuthStore } from '../../../store/authStore'
import type { Shift } from '../../../types/shift'
import { IconButton } from '../../../components/IconButton'
import { CreditEntriesModal } from '../modals/CreditEntriesModal'
import { HandoverModal } from '../modals/HandoverModal'
import { ResolveDiscrepancyModal } from '../modals/ResolveDiscrepancyModal'
import { STATUS_LABELS, fmtAmt } from '../shiftLabels'
import { codeLabel } from '../../../constants/labels'

// ── History row ───────────────────────────────────────────────────────────────
// Payment breakdown is always visible for closed shifts.
// Credit amount is clickable — opens a popup modal listing all client credit entries.

export function HistoryRow({ shift }: { shift: Shift }) {
  const { user } = useAuthStore()

  const isOwnerOrAdmin      = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isManagerOrAbove    = isOwnerOrAdmin || user?.role === 'MANAGER'
  const isPendingResolution = shift.status === 'CLOSED_DISCREPANCY_PENDING'
  const isPendingApproval   = shift.status === 'CLOSED_DISCREPANCY_PENDING_APPROVAL'
  const canResolve          = isPendingResolution && isManagerOrAbove
  const canResolveApproval  = isPendingApproval && isOwnerOrAdmin

  const [creditModalOpen,    setCreditModalOpen]    = useState(false)
  const [resolveModalOpen,   setResolveModalOpen]   = useState(false)
  const [handoverOpen,       setHandoverOpen]       = useState(false)

  const badge            = STATUS_LABELS[shift.status] ?? { label: shift.status, color: 'bg-slate-100 text-slate-600' }
  const isClosed         = shift.totalAmountDue != null
  const digitalTotal     = (shift.upiCollected ?? 0) + (shift.cardCollected ?? 0)
  const hasCreditEntries = (shift.creditEntries?.length ?? 0) > 0
  const creditAmt        = shift.creditTotal ?? 0

  return (
    <>
      {/* ── Main data row ─────────────────────────────────────────────────── */}
      <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
        <td className="px-5 py-3 text-slate-500 text-xs font-mono hidden md:table-cell">{shift.id}</td>
        <td className="px-5 py-3">
          <span className="text-xs text-slate-500 block">
            {shift.duName ?? `DU #${shift.duNumber}`}
          </span>
          <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
            {shift.nozzles.map((n) => `#${n.nozzleNumber} ${n.fuelType}`).join(', ')}
          </span>
        </td>
        <td className="px-5 py-3 hidden md:table-cell">
          {shift.shiftWindow ? (
            <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
              {shift.shiftWindow}
            </span>
          ) : (
            <span className="text-xs text-slate-500">—</span>
          )}
        </td>
        <td className="px-5 py-3 text-sm text-slate-700 font-medium">{shift.operatorName}</td>
        <td className="px-5 py-3 text-xs text-slate-500">{shift.shiftDate}</td>
        <td className="px-5 py-3 text-sm font-semibold text-slate-800">
          {fmtAmt(shift.totalAmountDue)}
        </td>
        <td className="px-5 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>
              {badge.label}
            </span>
            {shift.isBackfilled && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                Backfilled
              </span>
            )}
          </div>
        </td>
        <td className="px-5 py-3 hidden md:table-cell">
          {shift.discrepancyAmount != null ? (
            <span className={`text-xs font-semibold ${
              shift.discrepancyType === 'SHORT' ? 'text-red-600' : 'text-amber-600'
            }`}>
              {shift.discrepancyType} {fmtAmt(shift.discrepancyAmount)}
            </span>
          ) : (
            <span className="text-xs text-slate-500">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            {canResolve && (
              <button onClick={() => setResolveModalOpen(true)} className="ui-btn ui-btn-danger min-h-0 px-3 py-1.5 text-xs">
                Resolve
              </button>
            )}
            {canResolveApproval && (
              <button onClick={() => setResolveModalOpen(true)} className="ui-btn ui-btn-warning min-h-0 px-3 py-1.5 text-xs">
                Approve
              </button>
            )}
            {isPendingApproval && !isOwnerOrAdmin && (
              <span className="text-xs text-orange-600 font-medium">Owner approval needed</span>
            )}
            {shift.discrepancyResolution && (
              <span className="text-xs text-slate-500">{codeLabel(shift.discrepancyResolution)}</span>
            )}
            {isClosed && (
              <IconButton
                onClick={() => setHandoverOpen(true)}
                className="text-slate-500 hover:text-slate-600 transition-colors"
                label="Print handover report"
                icon={<Printer size={14} strokeWidth={2} />}
              />
            )}
          </div>
        </td>
      </tr>

      {/* ── Payment breakdown row — always visible for closed shifts ──────── */}
      {isClosed && (
        <tr className="border-b border-slate-100 bg-slate-50/40">
          <td colSpan={9} className="px-5 pb-3 pt-1">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">

              {/* Cash */}
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-500">Cash</span>
                <span className="font-semibold text-slate-700">{fmtAmt(shift.cashCollected)}</span>
              </div>

              {/* UPI + Card */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-slate-500">UPI + Card</span>
                <span className="font-semibold text-slate-700">
                  {digitalTotal > 0 ? fmtAmt(digitalTotal) : '—'}
                </span>
                {(shift.upiCollected ?? 0) > 0 && (
                  <span className="text-slate-500 bg-blue-50 px-1.5 py-0.5 rounded">
                    UPI {fmtAmt(shift.upiCollected)}
                  </span>
                )}
                {(shift.cardCollected ?? 0) > 0 && (
                  <span className="text-slate-500 bg-blue-50 px-1.5 py-0.5 rounded">
                    Card {fmtAmt(shift.cardCollected)}
                  </span>
                )}
              </div>

              {/* Credit — clickable pill that opens the modal */}
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                <span className="text-slate-500">Credit</span>
                {creditAmt > 0 ? (
                  hasCreditEntries ? (
                    <button
                      type="button"
                      onClick={() => setCreditModalOpen(true)}
                      className="flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                      title="Click to view credit details"
                    >
                      {fmtAmt(creditAmt)}
                      <span className="text-orange-500 text-xs">
                        · {shift.creditEntries.length} client{shift.creditEntries.length !== 1 ? 's' : ''} ↗
                      </span>
                    </button>
                  ) : (
                    <span className="font-semibold text-orange-700">{fmtAmt(creditAmt)}</span>
                  )
                ) : (
                  <span className="text-slate-500">—</span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* ── Credit entries popup modal ─────────────────────────────────────── */}
      {creditModalOpen && hasCreditEntries && (
        <CreditEntriesModal
          shift={shift}
          entries={shift.creditEntries}
          creditTotal={creditAmt}
          onClose={() => setCreditModalOpen(false)}
        />
      )}

      {/* ── Resolve discrepancy modal ──────────────────────────────────────── */}
      {resolveModalOpen && (
        <ResolveDiscrepancyModal
          shift={shift}
          onClose={() => setResolveModalOpen(false)}
        />
      )}

      {/* ── Handover print modal ──────────────────────────────────────────── */}
      {handoverOpen && (
        <HandoverModal shift={shift} onClose={() => setHandoverOpen(false)} />
      )}
    </>
  )
}
