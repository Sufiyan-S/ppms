import { describe, expect, it } from 'vitest'
import { maskPhone } from './maskPhone'

describe('maskPhone', () => {
  it('shows only the last four digits', () => {
    expect(maskPhone('9876543210')).toBe('•••••• 3210')
  })

  it('returns short or empty values unchanged', () => {
    expect(maskPhone('123')).toBe('123')
    expect(maskPhone('')).toBe('')
  })
})
