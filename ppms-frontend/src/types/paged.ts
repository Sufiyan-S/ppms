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

/** Spring Data `Page` as serialised by the backend (PageSerializationMode.VIA_DTO). */
export interface SpringPage<T> {
  content: T[]
  page: {
    size: number
    number: number
    totalElements: number
    totalPages: number
  }
}
