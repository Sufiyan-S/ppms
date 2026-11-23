import { describe, expect, it } from 'vitest'
import { shiftLength } from './shiftDefinitionRows'

describe('shiftLength', () => {
  it('measures a day shift from its start to its end', () => {
    expect(shiftLength({ startTime: '06:00', endTime: '14:30', isNightShift: false }))
      .toEqual({ hours: 8, minutes: 30, endsNextDay: false })
  })

  it('carries a night shift past midnight into the next day', () => {
    expect(shiftLength({ startTime: '21:00', endTime: '09:00', isNightShift: true }))
      .toEqual({ hours: 12, minutes: 0, endsNextDay: true })
  })

  it('refuses a day shift that ends at or before its start', () => {
    expect(shiftLength({ startTime: '21:00', endTime: '09:00', isNightShift: false })).toBeNull()
    expect(shiftLength({ startTime: '08:00', endTime: '08:00', isNightShift: false })).toBeNull()
  })
})
