import { describe, expect, it } from 'vitest'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { formatClock, shiftRanges, timelineCoverage } from './shiftCoverage'

// Stored end times are the last minute worked: a shift typed as 06:00 → 14:00 is stored as 06:00 → 13:59.
const definition = (id: number, name: string, startTime: string, endTime: string, sortOrder = id): ShiftDefinition => ({
  id, pumpId: 2, name, startTime, endTime, crossesMidnight: endTime < startTime, isNightShift: endTime < startTime,
  sortOrder, effectiveFrom: '2026-04-01', effectiveTo: null, windowLabel: '',
})

describe('shiftRanges', () => {
  it('places a day shift from its start up to its exclusive end', () => {
    expect(shiftRanges(definition(1, 'Morning', '06:00:00', '13:59:00'))).toEqual([{ start: 360, end: 840 }])
  })

  it('splits an overnight shift at midnight into an evening and a morning piece', () => {
    expect(shiftRanges(definition(1, 'Night', '22:00:00', '05:59:00'))).toEqual([
      { start: 1320, end: 1440 },
      { start: 0, end: 360 },
    ])
  })

  it('runs a shift ending at midnight to the end of the day without a second piece', () => {
    expect(shiftRanges(definition(1, 'Evening', '14:00:00', '23:59:00'))).toEqual([{ start: 840, end: 1440 }])
  })
})

describe('timelineCoverage', () => {
  it('finds no gap or overlap when shifts meet end to start round the clock', () => {
    const coverage = timelineCoverage([
      definition(1, 'Morning', '06:00:00', '13:59:00'),
      definition(2, 'Evening', '14:00:00', '21:59:00'),
      definition(3, 'Night', '22:00:00', '05:59:00'),
    ])
    expect(coverage.gaps).toEqual([])
    expect(coverage.overlaps).toEqual([])
    expect(coverage.laneCount).toBe(1)
    expect(coverage.segments).toHaveLength(4)
  })

  it('joins an uncovered stretch across midnight into one gap', () => {
    const coverage = timelineCoverage([
      definition(1, 'Morning', '06:00:00', '13:59:00'),
      definition(2, 'Evening', '14:00:00', '21:59:00'),
    ])
    expect(coverage.gaps).toEqual([{ start: 1320, end: 360 }])
  })

  it('names the shifts that overlap and drops the later one to a second lane', () => {
    const coverage = timelineCoverage([
      definition(1, 'Morning', '06:00:00', '14:59:00'),
      definition(2, 'Evening', '14:00:00', '05:59:00'),
    ])
    expect(coverage.overlaps).toEqual([{ start: 840, end: 900, names: ['Morning', 'Evening'] }])
    expect(coverage.laneCount).toBe(2)
    expect(coverage.gaps).toEqual([])
  })
})

describe('formatClock', () => {
  it('reads minutes from midnight as a 12-hour time, with the end of the day as midnight', () => {
    expect(formatClock(0)).toBe('12:00 AM')
    expect(formatClock(810)).toBe('1:30 PM')
    expect(formatClock(1440)).toBe('12:00 AM')
  })
})
