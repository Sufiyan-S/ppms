import { describe, expect, it } from 'vitest'
import { priceChange } from './fuelPriceChange'

describe('priceChange', () => {
  it('is nothing until a positive price is typed', () => {
    expect(priceChange(96.72, '')).toBeNull()
    expect(priceChange(96.72, '0')).toBeNull()
    expect(priceChange(96.72, '-1')).toBeNull()
  })

  it('gives the rupee and percent change from the current price', () => {
    expect(priceChange(100, '101.5')).toEqual({ amount: 1.5, percent: 1.5 })
    expect(priceChange(100, '98')).toEqual({ amount: -2, percent: -2 })
  })

  it('has no percent when the fuel has no current price', () => {
    expect(priceChange(undefined, '96.72')).toEqual({ amount: 0, percent: null })
  })
})
