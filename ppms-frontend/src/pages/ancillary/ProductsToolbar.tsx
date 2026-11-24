import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FilterBar } from '../../components/layout/FilterBar'
import { PRODUCT_FILTERS, PRODUCT_SORTS } from './productFilters'
import type { ProductFilter, ProductSort } from './productFilters'

const CHIP_CLASS = 'ui-chip inline-flex items-center gap-1.5 min-h-11 md:min-h-8'

interface ProductsToolbarProps {
  search: string
  onSearchChange: (search: string) => void
  filter: ProductFilter
  onFilterChange: (filter: ProductFilter) => void
  counts: Record<ProductFilter, number>
  sort: ProductSort
  onSortChange: (sort: ProductSort) => void
  shownCount: number
  totalCount: number
  onClearFilters: () => void
}

/** Search, the All / Low stock / No price / Disabled chips with their counts, and the sort order. */
export function ProductsToolbar({
  search, onSearchChange, filter, onFilterChange, counts, sort, onSortChange, shownCount, totalCount, onClearFilters,
}: ProductsToolbarProps) {
  const { t } = useTranslation(['ancillary', 'common'])
  const isFiltered = search.trim() !== '' || filter !== 'all'

  return (
    <FilterBar
      label={t('products.filtersLabel')}
      hasActiveFilters={isFiltered}
      onClearFilters={onClearFilters}
      summary={isFiltered ? t('products.shownOfTotal', { shown: shownCount, total: totalCount }) : undefined}
      className="rounded-card border border-border bg-surface"
    >
      <div className="ui-search-shell w-full sm:w-64">
        <Search aria-hidden="true" className="ui-search-shell__icon" />
        <input
          type="search"
          aria-label={t('products.searchLabel')}
          placeholder={t('products.searchPlaceholder')}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="ui-search-shell__input text-sm"
        />
        {search && (
          <button type="button" onClick={() => onSearchChange('')} aria-label={t('products.clearSearch')} className="ui-search-shell__clear">
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      <div role="group" aria-label={t('products.filters.label')} className="ui-chip-row">
        {PRODUCT_FILTERS.map((option) => (
          <button key={option} type="button" aria-pressed={filter === option} onClick={() => onFilterChange(option)} className={CHIP_CLASS}>
            {t(`products.filters.${option}`)}{' '}
            <span className="tabular-nums text-ink-3">{counts[option]}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-ink-3">
        {t('products.sort.label')}
        <select value={sort} onChange={(e) => onSortChange(e.target.value as ProductSort)} className="min-h-11 text-sm md:min-h-9">
          {PRODUCT_SORTS.map((option) => (
            <option key={option} value={option}>{t(`products.sort.${option}`)}</option>
          ))}
        </select>
      </label>
    </FilterBar>
  )
}
