import { useTranslation } from 'react-i18next'
import { FilterBar } from '../../components/layout/FilterBar'
import { IconButton } from '../../components/IconButton'
import { AGING_FILTERS, SORT_KEYS } from './creditAging'
import type { AgingSortKey } from './creditAging'
import type { CreditAgingView } from './useCreditAging'

interface AgingFilterBarProps {
  view: CreditAgingView
  /** For views without column headers to sort by: the client list and the phone cards. */
  showSortMenu?: boolean
}

/** Status filters with their counts, a name or phone search and, for the list, a sort menu. */
export function AgingFilterBar({ view, showSortMenu = false }: AgingFilterBarProps) {
  const { t } = useTranslation('credit')
  const { aging, filter, setFilter, countByFilter, search, setSearch, sort, chooseSort, clearFilters, hasActiveFilters } = view

  return (
    <FilterBar label={t('aging.showClients')} onClearFilters={clearFilters} hasActiveFilters={hasActiveFilters}>
      <div className="ui-chip-row">
        {AGING_FILTERS.map(option => (
          <button key={option.value} type="button" aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)} className="ui-chip">
            {t(`aging.filters.${option.labelKey}`)}{aging ? ` (${countByFilter[option.value]})` : ''}
          </button>
        ))}
      </div>
      <div className="ui-search-shell min-w-56 flex-1">
        <svg className="ui-search-shell__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input aria-label={t('aging.searchLabel')}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('aging.searchPlaceholder')}
          className="ui-search-shell__input text-sm leading-5"
        />
        {search && (
          <IconButton
            onClick={() => setSearch('')}
            className="ui-search-shell__clear"
            label={t('aging.clearSearch')}
            icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>}
          />
        )}
      </div>
      {showSortMenu && (
        <label className="flex items-center gap-2 text-xs text-ink-3">
          {t('aging.sortBy')}
          <select value={sort.key} onChange={e => chooseSort(e.target.value as AgingSortKey)} className="text-sm">
            {SORT_KEYS.map(key => <option key={key} value={key}>{t(`aging.columns.${key}`)}</option>)}
          </select>
        </label>
      )}
    </FilterBar>
  )
}
