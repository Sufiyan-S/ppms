import { useState, useEffect } from 'react'
import { withToggled } from '../../utils/setToggle'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock, DipCheck } from '../../api/inventoryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { DipItem } from './DipItem'
import { fmtDate } from './inventoryFormat'

export function DipHistory({ pumpId, tanks, canViewFinancials }: { pumpId: number; tanks: TankStock[]; canViewFinancials: boolean }) {
  const [dipHistOpen,       setDipHistOpen]       = useState(false)
  const [dipPage,           setDipPage]           = useState(0)
  const [dipPageSize,       setDipPageSize]       = useState(10)
  const [dipTankFilter,          setDipTankFilter]          = useState('')
  const [dipFuelFilter,          setDipFuelFilter]          = useState('')
  const [collapsedDipGroups,     setCollapsedDipGroups]     = useState<Set<string>>(new Set())

  const { data: dipChecksPage, isLoading: dipLoading } = useQuery({
    queryKey: ['dipChecks', pumpId, dipPage, dipPageSize],
    queryFn:  () => inventoryApi.getDipChecks(pumpId, dipPage, dipPageSize),
    enabled:  dipHistOpen,
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
      <div className="ui-card p-0 overflow-hidden">
        <button
          onClick={() => setDipHistOpen(v => !v)}
          className="ui-accordion-trigger"
        >
          <span className="ui-accordion-title">DIP Check History</span>
          <span className={`ui-accordion-arrow ${dipHistOpen ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
        </button>
        {dipHistOpen && (
          <div className="ui-accordion-content border-t border-slate-100">
            <div className="ui-toolbar">
              <p className="ui-toolbar-title">Filter DIP Checks</p>
              <div className="ui-toolbar-actions">
                <div className="w-44">
                <SearchableSelect label="Filter DIP checks by tank"
                  value={dipTankFilter}
                  onChange={v => setDipTankFilter(v)}
                  options={[
                    { value: '', label: 'All Tanks' },
                    ...tanks.map(t => ({ value: t.tankIdentifier, label: t.tankIdentifier })),
                  ]}
                  placeholder="Filter by tank"
                />
              </div>
                <div className="w-44">
                <SearchableSelect label="Filter DIP checks by fuel type"
                  value={dipFuelFilter}
                  onChange={v => setDipFuelFilter(v)}
                  options={[
                    { value: '', label: 'All Fuel Types' },
                    ...Array.from(new Set(tanks.map(t => t.fuelType))).map(ft => ({ value: ft, label: ft })),
                  ]}
                  placeholder="Filter by fuel type"
                />
              </div>
                {(dipTankFilter || dipFuelFilter) && (
                  <button
                    onClick={() => { setDipTankFilter(''); setDipFuelFilter('') }}
                    className="ui-btn ui-btn-ghost text-xs"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {dipLoading ? (
              <div className="p-5 text-sm text-slate-500">Loading...</div>
            ) : (() => {
              // Apply client-side filters on the current page's data
              const filtered = dipChecks.filter(d =>
                (!dipTankFilter || d.tankIdentifier === dipTankFilter) &&
                (!dipFuelFilter || d.fuelType === dipFuelFilter)
              )

              if (filtered.length === 0) {
                return (
                  <div className="p-5 text-sm text-slate-500">
                    {dipChecks.length === 0
                      ? 'No DIP checks recorded yet.'
                      : 'No DIP checks match the selected filters on this page.'}
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
                <div className="divide-y divide-slate-100">
                  {groups.map(([dateKey, rows]) => {
                    const allBalanced = rows.every(r => r.variance === 0)
                    const isCollapsed = collapsedDipGroups.has(dateKey)
                    const toggleDip = () => setCollapsedDipGroups(prev => withToggled(prev, dateKey))
                    return (
                      <div key={dateKey} className="px-5 py-4 space-y-2">
                        <button
                          type="button"
                          onClick={toggleDip}
                          className="w-full flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
                        >
                          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                            {fmtDate(dateKey)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {rows.length} tank{rows.length !== 1 ? 's' : ''} checked
                          </span>
                          {allBalanced && (
                            <span className="ml-auto text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              All Balanced
                            </span>
                          )}
                          {!allBalanced && (
                            <span className="ml-auto text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              Variance Detected
                            </span>
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
                  <div className="px-5">
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
          </div>
        )}
      </div>
  )
}
