import { useState } from 'react'
import { withToggled } from '../../../utils/setToggle'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { shiftApi } from '../../../api/shiftApi'
import type { Shift } from '../../../types/shift'
import { SkeletonRows } from '../../../components/Skeleton'
import { formatIstDate, localDateInputValue } from '../../../utils/date'
import { parseApiError } from '../../../utils/apiError'
import { HistoryCard, HistoryRow } from './HistoryRow'
import { historyColumns } from './historyColumns'
import { labelForDate } from '../shiftLabels'
import { DataTable } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { MoneyText } from '../../../components/AmountText'
import { useIsPhone } from '../../../hooks/useIsPhone'

// ── Day View ──────────────────────────────────────────────────────────────────

export function DayViewHistory({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['shifts', 'common'])
  const isPhone = useIsPhone()
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
  if (error) return <p role="alert" className="ui-alert ui-alert-error m-4 text-sm">{parseApiError(error, t('history.loadFailed'))}</p>
  if (visibleDates.length === 0) {
    return <p className="ui-empty px-6 py-6">{t('history.dayEmpty')}</p>
  }

  return (
    <div className="divide-y divide-border">
      {visibleDates.map((date) => {
        const dayShifts = grouped[date]
        const isOpen    = openDays.has(date)
        const openCount = dayShifts.filter((sh) => sh.status === 'OPEN' || sh.status === 'OPEN_OVERDUE').length
        const totalAmt  = dayShifts.reduce((s, sh) => s + (sh.totalAmountDue ?? 0), 0)
        const label     = labelForDate(date)
        const isToday   = date === todayStr
        const panelId   = `shift-history-day-${date}`

        return (
          <div key={date}>
            {/* Day accordion header */}
            <button
              type="button"
              onClick={() => toggle(date)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center gap-3 px-4 py-(--density-row-y) text-left transition-colors hover:bg-bg sm:px-6"
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`text-sm font-semibold ${isToday ? 'text-primary' : 'text-ink'}`}>
                  {label}
                </span>
                <span className="text-xs text-ink-3">{fmtShortDate(date)}</span>
                <span className="text-xs text-ink-3">
                  {t('history.shiftCount', { count: dayShifts.length })}{openCount > 0 && t('history.stillOpen', { count: openCount })}
                </span>
                {isToday && (
                  <StatusBadge tone="info" label={t('common:datePresets.today')} />
                )}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {totalAmt > 0 && (
                  <MoneyText value={totalAmt} className="text-sm font-semibold text-ink" />
                )}
                <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className={`ui-accordion-arrow ${isOpen ? 'ui-accordion-arrow--open' : ''}`} />
              </span>
            </button>

            <div id={panelId} hidden={!isOpen}>
              {isOpen && (isPhone ? (
                <ul aria-label={t('history.shiftsFor', { label })} className="ui-accordion-content divide-y divide-border border-t border-border">
                  {dayShifts.map((shift) => <HistoryCard key={shift.id} shift={shift} />)}
                </ul>
              ) : (
                <DataTable
                  caption={t('history.shiftsFor', { label })}
                  captionHidden
                  regionLabel={t('history.shiftsForDay')}
                  columns={historyColumns(t)}
                  rows={dayShifts}
                  rowKey={(shift) => shift.id}
                  renderRow={(shift) => <HistoryRow shift={shift} />}
                  className="ui-accordion-content @container rounded-none border-x-0 border-b-0"
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
