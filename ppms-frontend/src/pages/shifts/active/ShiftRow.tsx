import { Plus } from 'lucide-react'
import type { Shift } from '../../../types/shift'
import { formatIstDateTime } from '../../../utils/date'
import { STATUS_LABELS } from '../shiftLabels'
import { codeLabel } from '../../../constants/labels'

// ── Active shift row ──────────────────────────────────────────────────────────

export function ShiftRow({ shift, onClose, onAddCredit }: { shift: Shift; onClose?: () => void; onAddCredit: () => void }) {
  const badge     = STATUS_LABELS[shift.status] ?? { label: shift.status, color: 'bg-slate-100 text-slate-600' }
  const startTime = formatIstDateTime(shift.actualStartTime, { hour: '2-digit', minute: '2-digit' })
  const fuelAbbr: Record<string, string> = {
    PETROL: 'P', SPEED_PETROL: 'SP', DIESEL: 'D', SPEED_DIESEL: 'SD', CNG: 'CNG',
  }
  const prices = shift.fuelReadings
    .map((r) => `${fuelAbbr[r.fuelType] ?? r.fuelType}:₹${r.priceSnapshot}`)
    .join(' · ')

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50">
      <td className="px-6 py-3 font-medium text-slate-700">
        <span className="text-xs text-slate-500 block">
          {shift.duName ?? `DU #${shift.duNumber}`}
        </span>
        {shift.nozzles.map((n) => `#${n.nozzleNumber} ${codeLabel(n.fuelType)}`).join(', ')}
      </td>
      <td className="px-6 py-3 text-slate-600">{shift.operatorName}</td>
      <td className="px-6 py-3 text-slate-500 hidden md:table-cell">{shift.shiftWindow}</td>
      <td className="px-6 py-3 text-slate-500 hidden md:table-cell">{startTime}</td>
      <td className="px-6 py-3 text-slate-500 text-xs hidden md:table-cell">{prices || '—'}</td>
      <td className="px-6 py-3">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${badge.color}`}>{badge.label}</span>
      </td>
      <td className="px-6 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onAddCredit}
            className="ui-btn ui-btn-secondary ui-btn-compact"
          >
            <Plus size={12} strokeWidth={2.5} />
            <span>Credit</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="ui-btn ui-btn-primary ui-btn-compact"
            >
              Close
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
