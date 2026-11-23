import { describe, expect, it } from 'vitest'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { dayProgressFraction, findCurrentShiftWindow, splitRemaining } from './shiftWindow'

function definition(name: string, startTime: string, endTime: string, crossesMidnight = false): ShiftDefinition {
  return {
    id: name.length, pumpId: 4, name, startTime, endTime, crossesMidnight, isNightShift: crossesMidnight,
    sortOrder: 1, effectiveFrom: '2026-01-01', effectiveTo: null, windowLabel: '',
  }
}

// Stored end times are one minute short of the shown end, as the server keeps them.
const morning = definition('Morning', '06:00:00', '13:59:00')
const evening = definition('Evening', '14:00:00', '21:59:00')
const night = definition('Night', '22:00:00', '05:59:00', true)
const schedule = [morning, evening, night]

describe('findCurrentShiftWindow', () => {
  it('finds a daytime window with its IST start, end and elapsed share', () => {
    const current = findCurrentShiftWindow(schedule, new Date('2026-11-23T04:30:00Z')) // 10:00 IST

    expect(current?.definition.name).toBe('Morning')
    expect(current?.start.toISOString()).toBe('2026-11-23T00:30:00.000Z') // 06:00 IST
    expect(current?.end.toISOString()).toBe('2026-11-23T08:30:00.000Z') // 14:00 IST
    expect(current?.elapsedFraction).toBe(0.5)
    expect(current?.remainingMs).toBe(4 * 60 * 60_000)
  })

  it('finds a night window after midnight, counting from the previous evening', () => {
    const current = findCurrentShiftWindow(schedule, new Date('2026-11-23T20:30:00Z')) // 02:00 IST on the 24th

    expect(current?.definition.name).toBe('Night')
    expect(current?.start.toISOString()).toBe('2026-11-23T16:30:00.000Z') // 22:00 IST on the 23rd
    expect(current?.end.toISOString()).toBe('2026-11-24T00:30:00.000Z') // 06:00 IST on the 24th
    expect(current?.elapsedFraction).toBe(0.5)
  })

  it('finds a night window before midnight', () => {
    const current = findCurrentShiftWindow(schedule, new Date('2026-11-23T17:00:00Z')) // 22:30 IST

    expect(current?.definition.name).toBe('Night')
    expect(current?.elapsedFraction).toBeCloseTo(0.5 / 8)
  })

  it('hands over at the shown end time, so the next shift owns that minute', () => {
    expect(findCurrentShiftWindow(schedule, new Date('2026-11-23T08:30:00Z'))?.definition.name).toBe('Evening') // 14:00 IST
    expect(findCurrentShiftWindow(schedule, new Date('2026-11-23T08:29:30Z'))?.definition.name).toBe('Morning') // 13:59:30 IST
  })

  it('returns null between windows and without definitions', () => {
    expect(findCurrentShiftWindow([morning], new Date('2026-11-23T09:30:00Z'))).toBeNull() // 15:00 IST
    expect(findCurrentShiftWindow([], new Date('2026-11-23T04:30:00Z'))).toBeNull()
  })
})

describe('splitRemaining', () => {
  it('splits into whole hours and minutes, rounding minutes up', () => {
    expect(splitRemaining((2 * 60 + 14) * 60_000)).toEqual({ hours: 2, minutes: 14 })
    expect(splitRemaining((2 * 60 + 14) * 60_000 - 20_000)).toEqual({ hours: 2, minutes: 14 })
    expect(splitRemaining(30_000)).toEqual({ hours: 0, minutes: 1 })
    expect(splitRemaining(3 * 60 * 60_000)).toEqual({ hours: 3, minutes: 0 })
  })
})

describe('dayProgressFraction', () => {
  it('measures the IST business day from midnight to midnight', () => {
    expect(dayProgressFraction(new Date('2026-11-22T18:30:00Z'))).toBe(0) // 00:00 IST
    expect(dayProgressFraction(new Date('2026-11-23T06:30:00Z'))).toBe(0.5) // 12:00 IST
    expect(dayProgressFraction(new Date('2026-11-23T12:30:00Z'))).toBe(0.75) // 18:00 IST
  })
})
