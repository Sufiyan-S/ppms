import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPriceStale } from './fuelPrices'

describe('isPriceStale', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-23T06:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('treats no prices as stale', () => {
    expect(isPriceStale([])).toBe(true)
  })

  it('is fresh only when every price was set today in India', () => {
    expect(isPriceStale([{ effectiveFrom: '2026-11-22T19:00:00Z' }])).toBe(false)
    expect(isPriceStale([{ effectiveFrom: '2026-11-23T01:00:00Z' }, { effectiveFrom: '2026-11-22T10:00:00Z' }])).toBe(true)
  })
})
