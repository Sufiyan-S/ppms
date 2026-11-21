import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, formatIstDate, formatIstDateTime, istDateString, localDateInputValue, mondayOf, withReadableDates } from './date'

describe('istDateString', () => {
  it('returns the IST date when UTC is still on the previous day', () => {
    // 00:30 IST on 15 Mar is 19:00 UTC on 14 Mar
    expect(istDateString(new Date('2026-03-14T19:00:00Z'))).toBe('2026-03-15')
  })

  it('returns the same date as UTC late in the IST day', () => {
    expect(istDateString(new Date('2026-03-15T18:29:59Z'))).toBe('2026-03-15')
  })

  it('moves to the next IST day at 18:30 UTC', () => {
    expect(istDateString(new Date('2026-03-15T18:30:00Z'))).toBe('2026-03-16')
  })
})

describe('addDays', () => {
  it('adds and subtracts whole days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-05-10', 0)).toBe('2026-05-10')
  })
})

describe('localDateInputValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the IST date at 00:30 IST even though UTC is the previous day', () => {
    vi.setSystemTime(new Date('2026-03-14T19:00:00Z'))
    expect(localDateInputValue()).toBe('2026-03-15')
    expect(localDateInputValue(-1)).toBe('2026-03-14')
  })

  it('applies the offset in days to today in IST', () => {
    vi.setSystemTime(new Date('2026-12-31T20:00:00Z'))
    expect(localDateInputValue()).toBe('2027-01-01')
    expect(localDateInputValue(-365)).toBe('2026-01-01')
  })
})

describe('formatIstDate', () => {
  it('formats a plain YYYY-MM-DD as that IST calendar date', () => {
    expect(formatIstDate('2026-03-15')).toBe('15 Mar 2026')
  })

  it('formats an instant by its IST date', () => {
    expect(formatIstDate('2026-03-14T19:00:00Z')).toBe('15 Mar 2026')
    expect(formatIstDate(new Date('2026-03-14T19:00:00Z'))).toBe('15 Mar 2026')
  })

  it('accepts custom format options', () => {
    expect(formatIstDate('2026-03-15', { month: 'long', year: 'numeric' })).toBe('March 2026')
  })
})

describe('formatIstDateTime', () => {
  it('shows the IST time of a UTC instant', () => {
    const text = formatIstDateTime('2026-03-14T19:00:00Z')
    expect(text).toContain('15 Mar 2026')
    expect(text).toMatch(/12:30\s?am/i)
  })
})

describe('mondayOf', () => {
  it('returns the same date for a Monday', () => {
    expect(mondayOf('2026-11-16')).toBe('2026-11-16')
  })

  it('returns the previous Monday for a Sunday', () => {
    expect(mondayOf('2026-11-22')).toBe('2026-11-16')
  })

  it('crosses a month boundary', () => {
    expect(mondayOf('2026-12-02')).toBe('2026-11-30')
  })

  it('gives the IST week at 00:30 IST on Monday while UTC is still Sunday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-15T19:00:00Z'))
    expect(mondayOf(istDateString())).toBe('2026-11-16')
    vi.useRealTimers()
  })
})

describe('cached IST formatters', () => {
  it('formats the same options twice with the same result', () => {
    const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true }
    const first = formatIstDateTime('2026-11-20T03:30:00Z', options)
    expect(formatIstDateTime('2026-11-20T03:30:00Z', options)).toBe(first)
    expect(first).toMatch(/09:00\s?am/i)
  })
})

describe('withReadableDates', () => {
  it('rewrites machine dates inside a server message', () => {
    expect(withReadableDates('Pollution certificate expires on 2026-11-30.')).toBe('Pollution certificate expires on 30 Nov 2026.')
  })

  it('leaves text without dates unchanged', () => {
    expect(withReadableDates('Tank T1 is low')).toBe('Tank T1 is low')
  })
})
