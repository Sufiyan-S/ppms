import { describe, expect, it } from 'vitest'
import { relativeTime } from './relativeTime'

const now = new Date('2026-11-23T12:00:00Z')

describe('relativeTime', () => {
  it('says how long ago in the largest whole unit', () => {
    expect(relativeTime('2026-11-23T11:59:30Z', now)).toBe('just now')
    expect(relativeTime('2026-11-23T11:55:00Z', now)).toBe('5m ago')
    expect(relativeTime('2026-11-23T10:00:00Z', now)).toBe('2h ago')
    expect(relativeTime('2026-11-20T12:00:00Z', now)).toBe('3d ago')
  })

  it('shows the IST date after a week', () => {
    expect(relativeTime('2026-11-12T20:00:00Z', now)).toBe('13 Nov')
  })
})
