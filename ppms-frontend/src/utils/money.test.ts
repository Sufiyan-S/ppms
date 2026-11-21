import { describe, expect, it } from 'vitest'
import { roundToMillilitres, roundToPaise, toPaise, unitsSold } from './money'

describe('roundToPaise', () => {
  it('rounds half up like the backend HALF_UP mode', () => {
    expect(roundToPaise(1.005)).toBe(1.01)
    expect(roundToPaise(2.675)).toBe(2.68)
    expect(roundToPaise(1.004)).toBe(1)
  })

  it('rounds negative values half away from zero', () => {
    expect(roundToPaise(-1.005)).toBe(-1.01)
    expect(roundToPaise(-2.675)).toBe(-2.68)
  })

  it('keeps zero and whole rupees unchanged', () => {
    expect(roundToPaise(0)).toBe(0)
    expect(roundToPaise(150)).toBe(150)
  })
})

describe('toPaise', () => {
  it('returns whole paise without floating-point drift', () => {
    expect(toPaise(0.1 + 0.2)).toBe(30)
    expect(toPaise(1234.565)).toBe(123457)
    expect(toPaise(-10.5)).toBe(-1050)
  })
})

describe('roundToMillilitres', () => {
  it('rounds litres to 3 decimals half up', () => {
    expect(roundToMillilitres(10.0005)).toBe(10.001)
    expect(roundToMillilitres(10.0004)).toBe(10)
  })
})

describe('unitsSold', () => {
  it('returns the reading difference when the closing reading is higher', () => {
    expect(unitsSold(1000, 1050.1234, 999999)).toBe(50.123)
  })

  it('returns zero when the closing reading equals the opening reading', () => {
    expect(unitsSold(500, 500, null)).toBe(0)
  })

  it('treats a lower closing reading as a rollover when opening was near the meter maximum', () => {
    expect(unitsSold(99_995, 10, 100_000)).toBe(15)
  })

  it('treats a lower closing reading at exactly 99% of the maximum as a rollover', () => {
    expect(unitsSold(99_000, 0, 100_000)).toBe(1000)
  })

  it('returns null when a lower closing reading is not near the meter maximum', () => {
    expect(unitsSold(50_000, 10, 100_000)).toBeNull()
  })

  it('returns null when a lower closing reading has no known meter maximum', () => {
    expect(unitsSold(99_995, 10, null)).toBeNull()
  })
})
