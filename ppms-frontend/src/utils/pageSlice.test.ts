import { describe, expect, it } from 'vitest'
import { pageSlice } from './pageSlice'

const items = Array.from({ length: 25 }, (_, i) => i + 1)

describe('pageSlice', () => {
  it('returns the first page with next available', () => {
    const result = pageSlice(items, 0, 10)
    expect(result.content).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(result).toMatchObject({ page: 0, pageSize: 10, totalElements: 25, totalPages: 3, hasNext: true, hasPrevious: false })
  })

  it('returns a partial last page with previous available', () => {
    const result = pageSlice(items, 2, 10)
    expect(result.content).toEqual([21, 22, 23, 24, 25])
    expect(result.hasNext).toBe(false)
    expect(result.hasPrevious).toBe(true)
  })

  it('clamps a page past the end to the last page', () => {
    const result = pageSlice(items, 9, 10)
    expect(result.page).toBe(2)
    expect(result.content).toEqual([21, 22, 23, 24, 25])
  })

  it('reports one empty page for an empty list', () => {
    const result = pageSlice([], 0, 10)
    expect(result).toEqual({
      content: [], page: 0, pageSize: 10, totalElements: 0, totalPages: 1, hasNext: false, hasPrevious: false,
    })
  })

  it('reports exactly one page when the list fills the page', () => {
    const result = pageSlice(items.slice(0, 10), 0, 10)
    expect(result.totalPages).toBe(1)
    expect(result.hasNext).toBe(false)
  })
})
