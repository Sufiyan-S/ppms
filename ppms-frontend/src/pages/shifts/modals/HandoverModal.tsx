import { useEffect } from 'react'
import { Printer } from 'lucide-react'
import type { Shift } from '../../../types/shift'
import { formatIstDateTime } from '../../../utils/date'
import { ModalPortal } from '../../../components/ModalPortal'
import { formatCurrencyOrDash as fmtAmt } from '../../../utils/format'
import { IconButton } from '../../../components/IconButton'

// ── Handover Report Modal ─────────────────────────────────────────────────────

export function HandoverModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  // Tag <body> while this modal is open so @media print can isolate it:
  // hide #root and free the panel from its max-height/overflow constraints.
  useEffect(() => {
    document.body.classList.add('handover-printing')
    return () => document.body.classList.remove('handover-printing')
  }, [])

  return (
    <ModalPortal onClose={onClose} closeOnBackdropClick>
      <div className="ui-modal-backdrop">
      <div className="ui-modal-panel max-w-xl w-full">

        {/* Screen header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--primary print:hidden">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Shift Handover Report</h2>
            <p className="ui-modal-subtitle">
              Shift #{shift.id} · {shift.operatorName} · {shift.shiftDate}
              {' · '}
              {formatIstDateTime(shift.actualStartTime, { hour: '2-digit', minute: '2-digit' })}
              {' → '}
              {shift.actualEndTime
                ? formatIstDateTime(shift.actualEndTime, { hour: '2-digit', minute: '2-digit' })
                : 'Open'}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <Printer size={13} strokeWidth={2} /> Print
            </button>
            <IconButton label="Close" icon="×" onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close" />
          </div>
        </div>

        {/* Report body */}
        <div className="p-6 space-y-5 text-sm">

          {/* Title for print */}
          <div className="hidden print:block text-center mb-4">
            <h2 className="text-xl font-bold">Shift Handover Report</h2>
            <p className="text-slate-500 text-xs mt-1">Shift #{shift.id}</p>
          </div>

          {/* Shift info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Operator</p>
              <p className="font-semibold text-slate-800">{shift.operatorName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Date</p>
              <p className="font-semibold text-slate-800">{shift.shiftDate}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">DU</p>
              <p className="font-semibold text-slate-800">{shift.duName ?? `DU #${shift.duNumber}`}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Shift Window</p>
              <p className="font-semibold text-slate-800">{shift.shiftWindow ?? '—'}</p>
            </div>
          </div>

          {/* Nozzle readings */}
          {shift.fuelReadings && shift.fuelReadings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Meter Readings</p>
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th scope="col" className="px-3 py-2 text-left">Nozzle</th>
                    <th scope="col" className="px-3 py-2 text-right">Opening</th>
                    <th scope="col" className="px-3 py-2 text-right">Closing</th>
                    <th scope="col" className="px-3 py-2 text-right">Litres Sold</th>
                    <th scope="col" className="px-3 py-2 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shift.fuelReadings.map((r, i) => {
                    const nozzle = shift.nozzles.find(n => n.id === r.nozzleId)
                    return (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium">
                          {nozzle ? `#${nozzle.nozzleNumber} ${r.fuelType}` : r.fuelType}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{r.startReading ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.endReading ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold">{r.unitsSold != null ? `${Number(r.unitsSold).toFixed(3)} L` : '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{r.priceSnapshot != null ? `₹${r.priceSnapshot}` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Payment breakdown */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Collections</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Cash',       val: shift.cashCollected },
                { label: 'UPI',        val: shift.upiCollected },
                { label: 'Card',       val: shift.cardCollected },
                { label: 'Fleet Card', val: shift.fleetCardCollected },
                { label: 'Credit',     val: shift.creditTotal },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between bg-slate-50 rounded px-3 py-2">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-800">{fmtAmt(val)}</span>
                </div>
              ))}
              <div className="flex justify-between bg-slate-100 rounded px-3 py-2 col-span-2">
                <span className="font-semibold text-slate-700">Total Due</span>
                <span className="font-bold text-slate-900">{fmtAmt(shift.totalAmountDue)}</span>
              </div>
            </div>
          </div>

          {/* Discrepancy */}
          {shift.discrepancyAmount != null && (
            <div className={`rounded-lg p-3 ${shift.discrepancyType === 'SHORT' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1 text-slate-600">Discrepancy</p>
              <p className={`font-bold text-sm ${shift.discrepancyType === 'SHORT' ? 'text-red-700' : 'text-amber-700'}`}>
                {shift.discrepancyType}: {fmtAmt(shift.discrepancyAmount)}
              </p>
              {shift.discrepancyReason && (
                <p className="text-xs text-slate-500 mt-1">Reason: {shift.discrepancyReason}</p>
              )}
            </div>
          )}

          {/* Signature line for print */}
          <div className="hidden print:grid grid-cols-2 gap-10 pt-8">
            <div>
              <div className="border-b border-slate-400 mb-1" />
              <p className="text-xs text-slate-500">Operator Signature</p>
            </div>
            <div>
              <div className="border-b border-slate-400 mb-1" />
              <p className="text-xs text-slate-500">Supervisor Signature</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </ModalPortal>
  )
}
