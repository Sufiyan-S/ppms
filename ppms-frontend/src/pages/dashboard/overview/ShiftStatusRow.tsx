import type { Shift } from '../../../types/shift'
import { StatusBadge } from '../../../components/StatusBadge'
import { shiftStatusBadge } from '../../../components/statusBadges'
import { codeLabel } from '../../../constants/labels'
import { timeOpen } from './overviewFormat'

export function ShiftStatusRow({ shift }: { shift: Shift }) {
  const isOverdue = shift.status === 'OPEN_OVERDUE'
  const fuels = [...new Set(shift.nozzles.map(n => n.fuelType))].map((fuel) => codeLabel(fuel)).join(' · ')

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-bg transition-colors">
      <span
        aria-hidden="true"
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isOverdue ? 'bg-warn animate-pulse' : 'bg-ok'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-ink">
            {shift.duName ?? `DU ${shift.duNumber}`}
          </span>
          {fuels && <span className="text-xs text-ink-3">{fuels}</span>}
        </div>
        <p className="text-xs text-ink-3 mt-0.5">
          {shift.operatorName} · {shift.shiftWindow}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-ink-3">{timeOpen(shift.actualStartTime)}</span>
        <StatusBadge {...shiftStatusBadge(shift.status)} />
      </div>
    </div>
  )
}
