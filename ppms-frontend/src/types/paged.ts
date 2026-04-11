/**
 * Standard paginated response envelope returned by all list endpoints.
 * Mirrors com.ppms.common.dto.PagedResponse on the backend.
 */
export interface PagedResponse<T> {
  content: T[]
  page: number          // 0-based page index
  pageSize: number
  totalElements: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}
