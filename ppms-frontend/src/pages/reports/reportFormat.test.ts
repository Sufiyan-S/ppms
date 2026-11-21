import { afterEach, describe, expect, it, vi } from 'vitest'
import { fmtAmt, fmtDateTime, fmtQty, fmtShortDate, fmtShortDayMonth, todayIso, yesterdayIso } from './reportFormat'

describe('report formatters', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats amounts and quantities with two decimals', () => {
    expect(fmtAmt(1234567.891)).toBe('₹12,34,567.89')
    expect(fmtQty(1500)).toBe('1,500.00 L')
  })

  it('formats dates in IST', () => {
    expect(fmtShortDate('2026-03-05')).toBe('05 Mar 2026')
    expect(fmtShortDayMonth('2026-03-14T19:00:00Z')).toBe('15 Mar')
    expect(fmtDateTime('2026-03-14T19:00:00Z')).toMatch(/15 Mar 2026.*12:30\s?am/i)
  })

  it('returns today and yesterday by the IST calendar', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-14T19:00:00Z'))
    expect(todayIso()).toBe('2026-03-15')
    expect(yesterdayIso()).toBe('2026-03-14')
  })
})
