import { describe, expect, it } from 'vitest'
import { withToggled } from './setToggle'

describe('withToggled', () => {
  it('adds an item that is missing', () => {
    expect([...withToggled(new Set([1]), 2)]).toEqual([1, 2])
  })

  it('removes an item that is present', () => {
    expect([...withToggled(new Set(['a', 'b']), 'a')]).toEqual(['b'])
  })

  it('returns a new set and leaves the original unchanged', () => {
    const original = new Set([1])
    const next = withToggled(original, 1)
    expect(next).not.toBe(original)
    expect(original.has(1)).toBe(true)
  })
})
