import { useTranslation } from 'react-i18next'
import type { CashEventType } from '../../api/cashApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { EVENT_BADGES, EVENT_TYPES, fmtDate } from './cashFormat'
import type { CashEventsState } from './useCashEvents'
import { codeLabel } from '../../constants/labels'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'

export function CashEventList({ events }: { events: CashEventsState }) {
  const { t } = useTranslation(['cash', 'common'])
  const {
    cashData, isLoading, filteredEvents,
    eventTypeFilter, setEventTypeFilter, fromDate, setFromDate, toDate, setToDate,
    setPage, setPageSize,
  } = events

  const hasActiveFilters = Boolean(fromDate || toDate || eventTypeFilter)
  const clearFilters = () => {
    setFromDate('')
    setToDate('')
    setEventTypeFilter('')
    setPage(0)
  }

  return (
    <PageSection title={t('list.title')} flush>
      <FilterBar label={t('list.filtersLabel')} onClearFilters={clearFilters} hasActiveFilters={hasActiveFilters}>
        <div className="flex items-center gap-1.5">
          <label htmlFor="cash-events-from" className="text-xs text-ink-3 whitespace-nowrap">{t('common:fields.from')}</label>
          <input id="cash-events-from"
            type="date"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPage(0) }}
            className="text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="cash-events-to" className="text-xs text-ink-3 whitespace-nowrap">{t('common:fields.to')}</label>
          <input id="cash-events-to"
            type="date"
            value={toDate}
            onChange={e => { setToDate(e.target.value); setPage(0) }}
            className="text-xs"
          />
        </div>
        <div className="w-44">
          <SearchableSelect label={t('list.filterByType')}
            value={eventTypeFilter}
            onChange={v => { setEventTypeFilter(v as CashEventType | ''); setPage(0) }}
            options={[
              { value: '', label: t('list.allTypes') },
              ...EVENT_TYPES.map(type => ({ value: type, label: t(`eventTypes.${type}`) })),
            ]}
            size="sm"
          />
        </div>
      </FilterBar>

      {isLoading ? (
        <div className="px-5 py-4"><SkeletonRows count={4} /></div>
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon="transactions"
          title={fromDate || toDate ? t('list.emptyRangeTitle') : t('list.emptyTitle')}
          subtitle={fromDate || toDate ? t('list.emptyRangeSubtitle') : t('list.emptySubtitle')}
        />
      ) : (
        <>
          <div className="ui-record-list">
            {filteredEvents.map(ev => (
              <div key={ev.id} className="ui-record-row">
                <div className="flex items-center gap-3 min-w-0 ui-record-row__main">
                  <StatusBadge {...EVENT_BADGES[ev.eventType]} label={codeLabel(ev.eventType)} className="flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{ev.description}</p>
                    <div className="ui-record-row__meta mt-0">
                      <span>{fmtDate(ev.eventDate)}</span>
                    </div>
                  </div>
                </div>
                <MoneyText
                  value={ev.eventType === 'CASH_OUT' ? -ev.amount : ev.amount}
                  showSign
                  tone={ev.eventType === 'CASH_OUT' ? 'bad' : 'ok'}
                  className="text-sm font-semibold flex-shrink-0"
                />
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
    </PageSection>
  )
}
