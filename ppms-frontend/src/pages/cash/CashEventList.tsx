import type { CashEventType } from '../../api/cashApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { EVENT_STYLES, EVENT_TYPES, fmtAmt, fmtDate } from './cashFormat'
import type { CashEventsState } from './useCashEvents'
import { codeLabel } from '../../constants/labels'

export function CashEventList({ events }: { events: CashEventsState }) {
  const {
    cashData, isLoading, filteredEvents,
    eventTypeFilter, setEventTypeFilter, fromDate, setFromDate, toDate, setToDate,
    setPage, setPageSize,
  } = events

  return (
    <Reveal delay={270}>
    <div className="ui-card p-0 overflow-hidden">
      <div className="ui-toolbar">
        <p className="ui-toolbar-title">Cash Events</p>
        <div className="ui-toolbar-actions">
          <div className="flex items-center gap-1.5">
            <label htmlFor="cash-events-from" className="text-xs text-slate-500 whitespace-nowrap">From</label>
            <input id="cash-events-from"
              type="date"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setPage(0) }}
              className="text-xs h-7 px-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="cash-events-to" className="text-xs text-slate-500 whitespace-nowrap">To</label>
            <input id="cash-events-to"
              type="date"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setPage(0) }}
              className="text-xs h-7 px-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <div className="w-44">
          <SearchableSelect label="Filter by event type"
            value={eventTypeFilter}
            onChange={v => { setEventTypeFilter(v as CashEventType | ''); setPage(0) }}
            options={[
              { value: '', label: 'All Types' },
              ...EVENT_TYPES.map(t => ({ value: t.value, label: t.label })),
            ]}
            size="sm"
          />
        </div>
        </div>
      </div>

      {isLoading ? (
        <div className="px-5 py-4"><SkeletonRows count={4} /></div>
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon="transactions"
          title={fromDate || toDate ? 'No events in this date range' : 'No cash events recorded yet'}
          subtitle={fromDate || toDate ? 'Try adjusting the date filters above.' : 'Use the form above to record your first cash movement.'}
        />
      ) : (
        <>
          <div className="ui-record-list">
            {filteredEvents.map(ev => (
              <div key={ev.id} className="ui-record-row">
                <div className="flex items-center gap-3 min-w-0 ui-record-row__main">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${EVENT_STYLES[ev.eventType]}`}>
                    {codeLabel(ev.eventType)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{ev.description}</p>
                    <div className="ui-record-row__meta mt-0">
                      <span>{fmtDate(ev.eventDate)}</span>
                    </div>
                  </div>
                </div>
                <span className={`text-sm font-semibold flex-shrink-0 ${
                  ev.eventType === 'CASH_OUT' ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {ev.eventType === 'CASH_OUT' ? '−' : '+'}{fmtAmt(ev.amount)}
                </span>
              </div>
            ))}
          </div>
          {cashData?.events && (
            <div className="px-5">
              <Pagination
                data={cashData.events}
                onPageChange={p => setPage(p)}
                onPageSizeChange={s => { setPageSize(s); setPage(0) }}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </>
      )}
    </div>
    </Reveal>
  )
}
