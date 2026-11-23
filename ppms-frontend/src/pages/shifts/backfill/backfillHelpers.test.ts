import { afterEach, describe, expect, it, vi } from 'vitest'
import { maxDate, minDate, newCreditRow, safeParse } from './backfillHelpers'

describe('backfill helpers', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('limits the backfill date to between a year ago and yesterday in IST', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-14T19:00:00Z'))
    expect(maxDate()).toBe('2026-03-14')
    expect(minDate()).toBe('2025-03-15')
  })

  it('parses non-negative numbers and treats anything else as zero', () => {
    expect(safeParse('12.5')).toBe(12.5)
    expect(safeParse('')).toBe(0)
    expect(safeParse('-3')).toBe(0)
    expect(safeParse('abc')).toBe(0)
    expect(safeParse('Infinity')).toBe(0)
  })

  it('creates empty credit rows with distinct keys', () => {
    const first = newCreditRow()
    const second = newCreditRow()
    expect(first).toMatchObject({ clientId: null, clientName: '', amount: '' })
    expect(second._key).not.toBe(first._key)
  })
})
