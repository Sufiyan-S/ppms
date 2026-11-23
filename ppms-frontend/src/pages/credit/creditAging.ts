import type { CreditAgingRow } from '../../api/creditApi'

export type AgingFilter = 'all' | 'overdue' | 'over-limit' | 'pending-approval'
export type AgingSortKey =
  | 'name' | 'outstanding' | 'upTo30Days' | 'days31To60' | 'days61To90' | 'over90Days'
  | 'oldestUnpaidSaleDate' | 'lastPaymentDate' | 'daysOverdue'
export type SortDirection = 'asc' | 'desc'

/** Each label is credit.json aging.filters.<labelKey>, read when the filter bar renders. */
export const AGING_FILTERS: { value: AgingFilter; labelKey: 'all' | 'overdue' | 'overLimit' | 'pendingApproval' }[] = [
  { value: 'all', labelKey: 'all' },
  { value: 'overdue', labelKey: 'overdue' },
  { value: 'over-limit', labelKey: 'overLimit' },
  { value: 'pending-approval', labelKey: 'pendingApproval' },
]

export const SORT_KEYS: AgingSortKey[] = [
  'name', 'outstanding', 'upTo30Days', 'days31To60', 'days61To90', 'over90Days',
  'oldestUnpaidSaleDate', 'lastPaymentDate', 'daysOverdue',
]

export const DEFAULT_SORT: { key: AgingSortKey; direction: SortDirection } = { key: 'daysOverdue', direction: 'desc' }

export function agingFilterOf(value: string | null): AgingFilter {
  return AGING_FILTERS.find(filter => filter.value === value)?.value ?? 'all'
}

export function agingSortOf(key: string | null, direction: string | null): { key: AgingSortKey; direction: SortDirection } {
  const sortKey = SORT_KEYS.find(candidate => candidate === key)
  if (!sortKey) return DEFAULT_SORT
  return { key: sortKey, direction: direction === 'asc' ? 'asc' : 'desc' }
}

export function matchesAgingFilter(row: CreditAgingRow, filter: AgingFilter): boolean {
  switch (filter) {
    case 'overdue': return row.daysOverdue > 0
    case 'over-limit': return row.creditStatus === 'OVER_LIMIT'
    case 'pending-approval': return row.pendingPaymentCount > 0
    default: return true
  }
}

function compareValues(first: CreditAgingRow, second: CreditAgingRow, key: AgingSortKey): number {
  if (key === 'name') return first.name.localeCompare(second.name, undefined, { sensitivity: 'base' })
  if (key === 'oldestUnpaidSaleDate' || key === 'lastPaymentDate') {
    // An account with no date sorts as the oldest, so "never paid" comes first when sorting oldest first
    return (first[key] ?? '').localeCompare(second[key] ?? '')
  }
  return first[key] - second[key]
}

/** Sorted copy; ties go to the larger balance so the money that matters most stays on top. */
export function sortAgingRows(rows: CreditAgingRow[], key: AgingSortKey, direction: SortDirection): CreditAgingRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((first, second) =>
    sign * compareValues(first, second, key) || second.outstanding - first.outstanding)
}
