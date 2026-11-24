import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FilterBar } from '../../../components/layout/FilterBar'
import { codeLabel } from '../../../constants/labels'
import { NO_STAFF_FILTERS } from './staffList'
import type { StaffFilters, StaffStatusFilter } from './staffList'

const CHIP_CLASS = 'ui-chip min-h-11 md:min-h-8'
const STATUS_FILTERS: StaffStatusFilter[] = ['all', 'ACTIVE', 'INACTIVE']

interface Props {
  roles: string[]
  filters: StaffFilters
  onChange: (filters: StaffFilters) => void
  shownCount: number
  totalCount: number
}

/** Search box plus role and status chips over the staff already loaded. */
export function StaffToolbar({ roles, filters, onChange, shownCount, totalCount }: Props) {
  const { t } = useTranslation(['setup', 'common'])
  const isFiltered = filters.search.trim() !== '' || filters.role !== 'all' || filters.status !== 'all'
  const update = (patch: Partial<StaffFilters>) => onChange({ ...filters, ...patch })

  return (
    <FilterBar
      label={t('staff.filters.label')}
      hasActiveFilters={isFiltered}
      onClearFilters={() => onChange(NO_STAFF_FILTERS)}
      summary={t('staff.filters.summary', { shown: shownCount, total: totalCount })}
      className="rounded-card border border-border"
    >
      <div className="ui-search-shell w-full sm:w-64">
        <Search aria-hidden="true" className="ui-search-shell__icon" />
        <input
          type="search"
          aria-label={t('staff.filters.search')}
          placeholder={t('staff.filters.searchPlaceholder')}
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="ui-search-shell__input text-sm"
        />
        {filters.search && (
          <button type="button" onClick={() => update({ search: '' })} aria-label={t('staff.filters.clearSearch')}
            className="ui-search-shell__clear">
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      <div role="group" aria-label={t('staff.role')} className="ui-chip-row">
        {['all', ...roles].map((role) => (
          <button key={role} type="button" aria-pressed={filters.role === role} onClick={() => update({ role })} className={CHIP_CLASS}>
            {role === 'all' ? t('staff.filters.allRoles') : codeLabel(role)}
          </button>
        ))}
      </div>
      <div role="group" aria-label={t('staff.filters.status')} className="ui-chip-row">
        {STATUS_FILTERS.map((status) => (
          <button key={status} type="button" aria-pressed={filters.status === status} onClick={() => update({ status })} className={CHIP_CLASS}>
            {t(`staff.filters.statuses.${status}`)}
          </button>
        ))}
      </div>
    </FilterBar>
  )
}
