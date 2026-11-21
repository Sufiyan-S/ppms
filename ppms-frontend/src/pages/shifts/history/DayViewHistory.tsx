import { useState } from 'react'
import { withToggled } from '../../../utils/setToggle'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { shiftApi } from '../../../api/shiftApi'
import type { Shift } from '../../../types/shift'
import { SkeletonRows } from '../../../components/Skeleton'
import { formatIstDate, localDateInputValue } from '../../../utils/date'
import { parseApiError } from '../../../utils/apiError'
import { HistoryRow } from './HistoryRow'
import { labelForDate, fmtAmt } from '../shiftLabels'
import { ScrollRegion } from '../../../components/ScrollRegion'

// ── Day View ──────────────────────────────────────────────────────────────────

export function DayViewHistory({ pumpId }: { pumpId: number }) {
  const todayStr     = localDateInputValue()
  const yesterdayStr = localDateInputValue(-1)
  const dayBeforeStr = localDateInputValue(-2)

  const { data: shifts = [], isLoading, error } = useQuery({
    queryKey: ['shiftHistory', pumpId, 'days', dayBeforeStr],
    queryFn:  () => shiftApi.getShiftHistory(pumpId, { from: dayBeforeStr }),
  })

  // Group by shiftDate
  const grouped = shifts.reduce<Record<string, Shift[]>>((acc, s) => {
    ;(acc[s.shiftDate] ??= []).push(s)
    return acc
  }, {})

  // Only show the 3 most recent days: today, yesterday, day before yesterday
  const visibleDates = [todayStr, yesterdayStr, dayBeforeStr].filter(d => grouped[d])

  // Today is open by default; rest start collapsed
  const [openDays, setOpenDays] = useState<Set<string>>(new Set([todayStr]))

  const toggle = (d: string) =>
    setOpenDays(prev => withToggled(prev, d))

  const fmtShortDate = (d: string) =>
    formatIstDate(d, { day: 'numeric', month: 'short', year: 'numeric' })

  if (isLoading) return <div className="px-5 py-4"><SkeletonRows count={4} /></div>
  if (error) return <p role="alert" className="ui-alert ui-alert-error m-4 text-sm">{parseApiError(error, 'Failed to load shift history')}</p>
  if (visibleDates.length === 0) {
    return <p className="ui-empty px-6 py-6">No shift history for the last 3 days.</p>
  }

  return (
    <div className="divide-y divide-slate-100">
      {visibleDates.map((date) => {
        const dayShifts = grouped[date]
        const isOpen    = openDays.has(date)
        const openCount = dayShifts.filter((sh) => sh.status === 'OPEN' || sh.status === 'OPEN_OVERDUE').length
        const totalAmt  = dayShifts.reduce((s, sh) => s + (sh.totalAmountDue ?? 0), 0)
        const label     = labelForDate(date)
        const isToday   = date === todayStr

        return (
          <div key={date}>
            {/* Day accordion header */}
            <button
              onClick={() => toggle(date)}
              className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${isToday ? 'text-blue-700' : 'text-slate-700'}`}>
                  {label}
                </span>
                <span className="text-xs text-slate-500">{fmtShortDate(date)}</span>
                <span className="text-xs text-slate-500">
                  · {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}{openCount > 0 && ` (${openCount} still open)`}
                </span>
                {totalAmt > 0 && (
                  <span className="text-xs font-medium text-slate-600">
                    · {fmtAmt(totalAmt)}
                  </span>
                )}
                {isToday && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    Today
                  </span>
                )}
              </div>
              <ChevronDown size={14} strokeWidth={2} className={`ui-accordion-arrow ${isOpen ? 'ui-accordion-arrow--open' : ''}`} />
            </button>

            {/* Day shift table */}
            {isOpen && (
              <ScrollRegion label="Shifts for the day" className="ui-accordion-content overflow-x-auto border-t border-slate-100 bg-slate-50/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th scope="col" className="text-left px-5 py-2.5 font-medium hidden md:table-cell">ID</th>
                      <th scope="col" className="text-left px-5 py-2.5 font-medium">Nozzle</th>
                      <th scope="col" className="text-left px-5 py-2.5 font-medium hidden md:table-cell">Shift</th>
                      <th scope="col" className="text-left px-5 py-2.5 font-medium">Operator</th>
                      <th scope="col" className="text-left px-5 py-2.5 font-medium">Date</th>
                      <th scope="col" className="text-left px-5 py-2.5 font-medium">Amount Due</th>
                      <th scope="col" className="text-left px-5 py-2.5 font-medium">Status</th>
                      <th scope="col" className="text-left px-5 py-2.5 font-medium hidden md:table-cell">Discrepancy</th>
                      <th scope="col" className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {dayShifts.map((shift) => (
                      <HistoryRow key={shift.id} shift={shift} />
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
          </div>
        )
      })}
    </div>
  )
}
