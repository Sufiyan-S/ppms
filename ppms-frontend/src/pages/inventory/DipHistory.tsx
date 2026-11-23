import { useState, useEffect } from 'react'
import { codeLabel } from '../../constants/labels'
import { withToggled } from '../../utils/setToggle'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock, DipCheck } from '../../api/inventoryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { StatusBadge } from '../../components/StatusBadge'
import { SkeletonRows } from '../../components/Skeleton'
import { FilterBar } from '../../components/layout/FilterBar'
import { PageSection } from '../../components/layout/PageSection'
import { DipItem } from './DipItem'
import { fmtDate } from './inventoryFormat'

export function DipHistory({ pumpId, tanks, canViewFinancials }: { pumpId: number; tanks: TankStock[]; canViewFinancials: boolean }) {
  const { t } = useTranslation(['inventory', 'common'])
  const [dipPage,           setDipPage]           = useState(0)
  const [dipPageSize,       setDipPageSize]       = useState(10)
  const [dipTankFilter,          setDipTankFilter]          = useState('')
  const [dipFuelFilter,          setDipFuelFilter]          = useState('')
  const [collapsedDipGroups,     setCollapsedDipGroups]     = useState<Set<string>>(new Set())

  const { data: dipChecksPage, isLoading: dipLoading } = useQuery({
    queryKey: ['dipChecks', pumpId, dipPage, dipPageSize],
    queryFn:  () => inventoryApi.getDipChecks(pumpId, dipPage, dipPageSize),
  })
  const dipChecks = dipChecksPage?.content ?? []

  // When DIP data loads, collapse all groups except the first (newest) one
  useEffect(() => {
    const content = dipChecksPage?.content
    if (!content?.length) return
    const keys = [...new Set(content.map(d => d.checkedAt.slice(0, 10)))]
      .sort((a, b) => b.localeCompare(a))
    setCollapsedDipGroups(new Set(keys.slice(1)))
  }, [dipChecksPage])

  return (
    <PageSection title={t('dipHistory.title')} flush>
      <FilterBar
        label={t('dipHistory.filterTitle')}
        onClearFilters={() => { setDipTankFilter(''); setDipFuelFilter('') }}
        hasActiveFilters={Boolean(dipTankFilter || dipFuelFilter)}
      >
        <div className="w-44">
          <SearchableSelect label={t('dipHistory.filterByTank')}
            value={dipTankFilter}
            onChange={v => setDipTankFilter(v)}
            options={[
              { value: '', label: t('filters.allTanks') },
              ...tanks.map(tank => ({ value: tank.tankIdentifier, label: tank.tankIdentifier })),
            ]}
            placeholder={t('filters.byTank')}
          />
        </div>
        <div className="w-44">
          <SearchableSelect label={t('dipHistory.filterByFuel')}
            value={dipFuelFilter}
            onChange={v => setDipFuelFilter(v)}
            options={[
              { value: '', label: t('filters.allFuelTypes') },
              ...Array.from(new Set(tanks.map(tank => tank.fuelType))).map(ft => ({ value: ft, label: codeLabel(ft) })),
            ]}
            placeholder={t('filters.byFuelType')}
          />
        </div>
      </FilterBar>

            {dipLoading ? (
              <div className="p-(--density-card-pad)"><SkeletonRows count={3} /></div>
            ) : (() => {
              // Apply client-side filters on the current page's data
              const filtered = dipChecks.filter(d =>
                (!dipTankFilter || d.tankIdentifier === dipTankFilter) &&
                (!dipFuelFilter || d.fuelType === dipFuelFilter)
              )

              if (filtered.length === 0) {
                return (
                  <div className="p-(--density-card-pad) text-sm text-ink-3">
                    {dipChecks.length === 0
                      ? t('dipHistory.empty')
                      : t('dipHistory.noMatch')}
                  </div>
                )
              }

              // Group by calendar date, sorted newest-first (within current page)
              const groups = Object.entries(
                filtered.reduce<Record<string, DipCheck[]>>((acc, d) => {
                  const key = d.checkedAt.slice(0, 10)
                  ;(acc[key] ??= []).push(d)
                  return acc
                }, {})
              ).sort(([a], [b]) => b.localeCompare(a))

              return (
                <>
                <div className="divide-y divide-border">
                  {groups.map(([dateKey, rows]) => {
                    const allBalanced = rows.every(r => r.variance === 0)
                    const isCollapsed = collapsedDipGroups.has(dateKey)
                    const toggleDip = () => setCollapsedDipGroups(prev => withToggled(prev, dateKey))
                    return (
                      <div key={dateKey} className="space-y-2 px-(--density-card-pad) py-(--density-row-y)">
                        <button
                          type="button"
                          onClick={toggleDip}
                          className="w-full flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
                        >
                          <span className="text-xs font-semibold text-ink bg-surface-sunken px-2.5 py-1 rounded-control">
                            {fmtDate(dateKey)}
                          </span>
                          <span className="text-xs text-ink-3">
                            {t('dipHistory.tanksChecked', { count: rows.length })}
                          </span>
                          {allBalanced && (
                            <StatusBadge tone="ok" icon={Check} label={t('dipHistory.allBalanced')} className="ml-auto" />
                          )}
                          {!allBalanced && (
                            <StatusBadge tone="warn" icon={AlertTriangle} label={t('dipHistory.varianceDetected')} className="ml-auto" />
                          )}
                          <span className={`ui-accordion-arrow ml-1 ${!isCollapsed ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
                        </button>
                        {!isCollapsed && (
                          <div className="ui-accordion-content space-y-1.5">
                            {rows.map(d => (
                              <DipItem
                                key={d.id}
                                check={d}
                                pumpId={pumpId}
                                canReview={canViewFinancials}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                {dipChecksPage && (
                  <div className="px-(--density-card-pad)">
                    <Pagination
                      data={dipChecksPage}
                      onPageChange={p => setDipPage(p)}
                      onPageSizeChange={s => { setDipPageSize(s); setDipPage(0) }}
                      pageSizeOptions={[10, 20, 50]}
                    />
                  </div>
                )}
                </>
              )
            })()}
    </PageSection>
  )
}
