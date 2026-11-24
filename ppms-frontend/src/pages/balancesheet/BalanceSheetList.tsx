import { useTranslation } from 'react-i18next'
import { DatePresetChips } from '../../components/DatePresetChips'
import { EmptyState } from '../../components/EmptyState'
import { LoadError } from '../../components/LoadError'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { FilterBar } from '../../components/layout/FilterBar'
import { ReportListItem } from './ReportListItem'
import type { BalanceSheetList as BalanceSheetListState } from './useBalanceSheetList'

interface BalanceSheetListProps {
  pumpId: number | null
  list: BalanceSheetListState
  selectedId: number | null
  searchFor: (sheetId: number) => string
}

/** The date filters, the sheets in range and their pages. */
export function BalanceSheetList({ pumpId, list, selectedId, searchFor }: BalanceSheetListProps) {
  const { t } = useTranslation(['balancesheet', 'common'])
  const { filterRange, setFilterRange, setPage, changePageSize, query } = list
  const { data: reportsPage, isLoading, isLoadingError, refetch } = query
  const reports = reportsPage?.content ?? []

  return (
    <>
      <FilterBar
        label={t('list.filtersLabel')}
        onClearFilters={() => setFilterRange({ from: '', to: '' })}
        hasActiveFilters={Boolean(filterRange.from || filterRange.to)}
        summary={reportsPage && t('list.sheetCount', { count: reportsPage.totalElements })}
      >
        <DatePresetChips range={filterRange} onSelect={setFilterRange} />
        <div className="flex w-full flex-wrap items-center gap-2">
          <input aria-label={t('common:fields.fromDate')}
            type="date"
            value={filterRange.from}
            onChange={e => setFilterRange({ from: e.target.value, to: filterRange.to })}
            className="min-w-[8.5rem] flex-1 text-xs text-ink"
          />
          <span className="text-xs text-ink-3">{t('list.to')}</span>
          <input aria-label={t('common:fields.toDate')}
            type="date"
            value={filterRange.to}
            onChange={e => setFilterRange({ from: filterRange.from, to: e.target.value })}
            className="min-w-[8.5rem] flex-1 text-xs text-ink"
          />
        </div>
      </FilterBar>

      {(!pumpId || isLoading) ? (
        <div className="px-4 py-4"><SkeletonRows count={5} /></div>
      ) : isLoadingError ? (
        <LoadError onRetry={() => void refetch()} className="m-4" />
      ) : reports.length === 0 ? (
        <EmptyState icon="generic" title={t('list.emptyTitle')} subtitle={t('list.emptySubtitle')} />
      ) : (
        <ul>
          {reports.map(report => (
            <li key={report.id}>
              <ReportListItem report={report} search={searchFor(report.id)} isSelected={selectedId === report.id} />
            </li>
          ))}
        </ul>
      )}

      {reportsPage && (
        <div className="px-3">
          <Pagination data={reportsPage} onPageChange={setPage} onPageSizeChange={changePageSize} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}
    </>
  )
}
