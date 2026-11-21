import type { Shift, CreditEntry } from '../../../types/shift'
import { ModalPortal } from '../../../components/ModalPortal'
import { fmtAmt } from '../shiftLabels'

// ── Credit entries modal ───────────────────────────────────────────────────────

export function CreditEntriesModal({
  shift,
  entries,
  creditTotal,
  onClose,
}: {
  shift: Shift
  entries: CreditEntry[]
  creditTotal: number
  onClose: () => void
}) {
  return (
    <tr>
      <td colSpan={8} className="p-0">
        <ModalPortal onClose={onClose} closeOnBackdropClick>
        <div
          className="ui-modal-backdrop"
        >
          <div
            className="ui-modal-panel w-full max-w-md overflow-hidden"
          >
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Credit Sales</h2>
                <p className="ui-modal-subtitle">
                  Shift #{shift.id} · Nozzle {shift.nozzles.map((n) => `#${n.nozzleNumber}`).join(', ')} · {shift.operatorName} · {shift.shiftDate}
                </p>
              </div>
              <button aria-label="Close"
                type="button"
                onClick={onClose}
                className="ui-btn ui-btn-ghost ui-modal-close"
              >
                ×
              </button>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-orange-100 text-xs">
                  {entries.length} {entries.length === 1 ? 'client' : 'clients'} with outstanding credit
                </span>
                <span className="bg-white/20 text-white text-sm font-bold px-3 py-1 rounded-full">
                  {fmtAmt(creditTotal)} total
                </span>
              </div>
            </div>

            {/* Entry list */}
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {entries.map((entry, idx) => (
                <div key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
                  {/* Index badge */}
                  <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{entry.clientName}</p>
                      {entry.fuelType && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          entry.fuelType === 'PETROL'
                            ? 'bg-green-100 text-green-700'
                            : entry.fuelType === 'DIESEL'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {entry.fuelType}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {entry.billNo ? (
                        <span className="text-xs text-slate-500">
                          Bill: <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">{entry.billNo}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">No bill</span>
                      )}
                      {entry.description && (
                        <span className="text-xs text-slate-500 italic">"{entry.description}"</span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <span className="text-sm font-bold text-orange-700 shrink-0">
                    ₹{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer total */}
            <div className="bg-orange-50 border-t border-orange-200 px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-orange-800">Total Credit</span>
              <span className="text-base font-bold text-orange-800">{fmtAmt(creditTotal)}</span>
            </div>
          </div>
        </div>
        </ModalPortal>
      </td>
    </tr>
  )
}
