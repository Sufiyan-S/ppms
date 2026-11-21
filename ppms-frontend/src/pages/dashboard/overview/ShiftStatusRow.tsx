import type { Shift } from '../../../types/shift'
import { timeOpen } from './overviewFormat'

export function ShiftStatusRow({ shift }: { shift: Shift }) {
  const isOverdue = shift.status === 'OPEN_OVERDUE'
  const fuels = [...new Set(shift.nozzles.map(n => n.fuelType))].join(' · ')

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isOverdue ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">
            {shift.duName ?? `DU ${shift.duNumber}`}
          </span>
          {fuels && <span className="text-xs text-slate-500">{fuels}</span>}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {shift.operatorName} · {shift.shiftWindow}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-slate-500">{timeOpen(shift.actualStartTime)}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          isOverdue
            ? 'bg-red-100 text-red-700'
            : 'bg-emerald-100 text-emerald-700'
        }`}>
          {isOverdue ? 'Overdue' : 'Open'}
        </span>
      </div>
    </div>
  )
}
