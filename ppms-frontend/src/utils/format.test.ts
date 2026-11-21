import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDecimal, formatLitres } from './format'

describe('format helpers', () => {
  it('formats currency with the rupee sign, Indian grouping and two decimals', () => {
    expect(formatCurrency(1234567.5)).toBe('₹12,34,567.50')
    expect(formatCurrency(0)).toBe('₹0.00')
  })

  it('formats litres with three decimals', () => {
    expect(formatLitres(1234.5)).toBe('1,234.500 L')
  })

  it('formats decimals to the requested places', () => {
    expect(formatDecimal(3.14159)).toBe('3.14')
    expect(formatDecimal(3.14159, 3)).toBe('3.142')
  })
})
