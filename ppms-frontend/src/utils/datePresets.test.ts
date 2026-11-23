import { afterEach, describe, expect, it, vi } from 'vitest'
import { daysInRange, matchingPreset, periodChange, presetRange, previousPeriod } from './datePresets'

describe('presetRange', () => {
  const today = '2026-11-23'

  it('gives single days for today and yesterday', () => {
    expect(presetRange('today', today)).toEqual({ from: '2026-11-23', to: '2026-11-23' })
    expect(presetRange('yesterday', today)).toEqual({ from: '2026-11-22', to: '2026-11-22' })
  })

  it('starts this week on Monday and this month on the 1st', () => {
    expect(presetRange('thisWeek', today)).toEqual({ from: '2026-11-23', to: '2026-11-23' })
    expect(presetRange('thisWeek', '2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' })
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-11-01', to: '2026-11-23' })
  })

  it('covers the whole previous month, across a year end and a leap February', () => {
    expect(presetRange('lastMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetRange('lastMonth', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(presetRange('lastMonth', '2028-03-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('starts the financial year on 1 April: 31 March is still the old year and 1 April the new one', () => {
    expect(presetRange('fyToDate', '2027-03-31')).toEqual({ from: '2026-04-01', to: '2027-03-31' })
    expect(presetRange('fyToDate', '2027-04-01')).toEqual({ from: '2027-04-01', to: '2027-04-01' })
    expect(presetRange('fyToDate', today)).toEqual({ from: '2026-04-01', to: '2026-11-23' })
    expect(presetRange('fyToDate', '2027-01-05')).toEqual({ from: '2026-04-01', to: '2027-01-05' })
  })

  describe('with the device clock', () => {
    afterEach(() => vi.useRealTimers())

    it('counts from the IST date, not the device date', () => {
      vi.useFakeTimers()
      // 00:30 IST on 1 April 2027 is still 31 March in UTC
      vi.setSystemTime(new Date('2027-03-31T19:00:00Z'))
      expect(presetRange('fyToDate')).toEqual({ from: '2027-04-01', to: '2027-04-01' })
      expect(presetRange('today')).toEqual({ from: '2027-04-01', to: '2027-04-01' })
    })
  })
})

describe('matchingPreset', () => {
  it('names the preset a range equals, if any', () => {
    expect(matchingPreset({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-23')).toBe('lastMonth')
    expect(matchingPreset({ from: '2026-10-02', to: '2026-10-31' }, '2026-11-23')).toBeNull()
  })
})

describe('previousPeriod', () => {
  it('is the same number of days just before the range', () => {
    expect(previousPeriod({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-08-31', to: '2026-09-30' })
    expect(previousPeriod({ from: '2026-11-23', to: '2026-11-23' })).toEqual({ from: '2026-11-22', to: '2026-11-22' })
    expect(daysInRange({ from: '2026-04-01', to: '2027-03-31' })).toBe(365)
  })
})

describe('periodChange', () => {
  it('gives the direction and percentage change from the previous period', () => {
    expect(periodChange(1200, 1000)).toEqual({ direction: 'up', percent: 20 })
    expect(periodChange(750, 1000)).toEqual({ direction: 'down', percent: -25 })
    expect(periodChange(1000, 1000)).toEqual({ direction: 'same', percent: 0 })
  })

  it('measures against the size of a negative previous value', () => {
    expect(periodChange(-50, -100)).toEqual({ direction: 'up', percent: 50 })
  })

  it('has no percentage when the previous period was zero', () => {
    expect(periodChange(500, 0)).toEqual({ direction: 'up', percent: null })
    expect(periodChange(0, 0)).toEqual({ direction: 'same', percent: 0 })
  })

  it('rounds to one decimal place', () => {
    expect(periodChange(1001, 3000).percent).toBe(-66.6)
  })
})
