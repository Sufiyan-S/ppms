import { describe, expect, it } from 'vitest'
import { getMonthKey, getWeekKey, lastCompletedMonth } from './creditDates'

describe('getWeekKey', () => {
  it('labels a mid-week day with its Monday to Sunday range', () => {
    // Wednesday 18 Mar 2026
    expect(getWeekKey('2026-03-18T06:00:00Z')).toBe('16 Mar 2026 – 22 Mar 2026')
  })

  it('puts a Sunday in the week that started the Monday before', () => {
    expect(getWeekKey('2026-03-22T06:00:00Z')).toBe('16 Mar 2026 – 22 Mar 2026')
  })

  it('puts a Monday at the start of its own week', () => {
    expect(getWeekKey('2026-03-23T06:00:00Z')).toBe('23 Mar 2026 – 29 Mar 2026')
  })

  it('uses the IST date for a Sunday-night UTC instant that is already Monday in IST', () => {
    // 19:00 UTC Sunday 22 Mar = 00:30 IST Monday 23 Mar
    expect(getWeekKey('2026-03-22T19:00:00Z')).toBe('23 Mar 2026 – 29 Mar 2026')
  })

  it('spans a year boundary', () => {
    expect(getWeekKey('2026-01-01T06:00:00Z')).toBe('29 Dec 2025 – 04 Jan 2026')
  })
})

describe('getMonthKey', () => {
  it('names the IST month of an instant', () => {
    expect(getMonthKey('2026-03-31T19:00:00Z')).toBe('April 2026')
    expect(getMonthKey('2026-03-31T10:00:00Z')).toBe('March 2026')
  })
})

describe('lastCompletedMonth', () => {
  it('is the whole previous month, across a year boundary and in a leap year', () => {
    expect(lastCompletedMonth('2027-01-15')).toEqual({ periodFrom: '2026-12-01', periodTo: '2026-12-31' })
    expect(lastCompletedMonth('2028-03-01')).toEqual({ periodFrom: '2028-02-01', periodTo: '2028-02-29' })
  })
})
