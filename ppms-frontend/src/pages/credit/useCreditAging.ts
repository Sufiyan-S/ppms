import { useDeferredValue } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { creditApi } from '../../api/creditApi'
import {
  DEFAULT_SORT, agingFilterOf, agingSortOf, matchesAgingFilter, sortAgingRows,
} from './creditAging'
import type { AgingFilter, AgingSortKey } from './creditAging'

function firstDirectionFor(key: AgingSortKey) {
  return key === 'name' ? 'asc' : 'desc'
}

/**
 * Credit accounts by age of their unpaid balance, filtered, searched and sorted from the address
 * (?filter=overdue&q=sharma&sort=outstanding&dir=asc), so the client list and the aging table show the same view.
 */
export function useCreditAging(pumpId: number | null) {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = agingFilterOf(searchParams.get('filter'))
  const sort = agingSortOf(searchParams.get('sort'), searchParams.get('dir'))
  const search = searchParams.get('q') ?? ''
  const deferredSearch = useDeferredValue(search)

  const { data: aging, isLoading, isError } = useQuery({
    queryKey: ['credit-ledger', pumpId, 'aging'],
    queryFn: () => creditApi.getAging(pumpId!),
    enabled: pumpId != null,
  })

  const updateParams = (changes: Record<string, string | null>) => setSearchParams((params) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, value]) => (value === null ? next.delete(key) : next.set(key, value)))
    return next
  }, { replace: true })

  const setFilter = (value: AgingFilter) => updateParams({ filter: value === 'all' ? null : value })
  const setSearch = (value: string) => updateParams({ q: value === '' ? null : value })
  const setSortOrder = (key: AgingSortKey, direction: 'asc' | 'desc') => {
    const isDefault = key === DEFAULT_SORT.key && direction === DEFAULT_SORT.direction
    updateParams({ sort: isDefault ? null : key, dir: isDefault ? null : direction })
  }
  const toggleSort = (key: AgingSortKey) => setSortOrder(key,
    key === sort.key ? (sort.direction === 'desc' ? 'asc' : 'desc') : firstDirectionFor(key))
  const chooseSort = (key: AgingSortKey) => setSortOrder(key, firstDirectionFor(key))
  const clearFilters = () => updateParams({ filter: null, q: null })

  const query = deferredSearch.trim().toLowerCase()
  const allRows = aging?.clients ?? []
  const rows = sortAgingRows(
    allRows.filter(row => matchesAgingFilter(row, filter)
      && (!query || row.name.toLowerCase().includes(query) || (row.phone ?? '').includes(query))),
    sort.key, sort.direction)
  const countByFilter: Record<AgingFilter, number> = {
    'all': allRows.length,
    'overdue': aging?.summary.overdueCount ?? 0,
    'over-limit': aging?.summary.overLimitCount ?? 0,
    'pending-approval': aging?.summary.pendingApprovalCount ?? 0,
  }

  return {
    aging, isLoading, isError, allRows, rows, countByFilter,
    filter, setFilter, search, setSearch, searchedFor: deferredSearch.trim(), hasQuery: query !== '',
    sort, toggleSort, chooseSort, clearFilters,
    hasActiveFilters: filter !== 'all' || search !== '',
  }
}

export type CreditAgingView = ReturnType<typeof useCreditAging>
