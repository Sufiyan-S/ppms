import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLastUpdated } from './useLastUpdated'

const START = new Date('2026-03-15T06:00:00Z').getTime()

describe('useLastUpdated', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns nothing before data has loaded', () => {
    const { result } = renderHook(() => useLastUpdated(0))
    expect(result.current).toBe('')
  })

  it('counts up from just now as time passes', () => {
    const { result } = renderHook(() => useLastUpdated(START))
    expect(result.current).toBe('just now')

    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current).toBe('30s ago')

    act(() => vi.advanceTimersByTime(30 * 60_000))
    expect(result.current).toBe('30m ago')

    act(() => vi.advanceTimersByTime(2 * 60 * 60_000))
    expect(result.current).toBe('2h ago')
  })

  it('never shows a time in the future', () => {
    const { result } = renderHook(() => useLastUpdated(START + 60_000))
    expect(result.current).toBe('just now')
  })
})
