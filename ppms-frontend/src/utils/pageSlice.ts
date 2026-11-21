import type { PagedResponse } from '../types/paged'

/** Builds a PagedResponse shape from a client-side array slice — used for client-side pagination. */
export function pageSlice<T>(all: T[], page: number, pageSize: number): PagedResponse<T> {
  const totalElements = all.length
  const totalPages    = Math.max(1, Math.ceil(totalElements / pageSize))
  const safePage      = Math.min(page, totalPages - 1)
  const content       = all.slice(safePage * pageSize, (safePage + 1) * pageSize)
  return {
    content,
    page: safePage,
    pageSize,
    totalElements,
    totalPages,
    hasNext:     safePage < totalPages - 1,
    hasPrevious: safePage > 0,
  }
}
