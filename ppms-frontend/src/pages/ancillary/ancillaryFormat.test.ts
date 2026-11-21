import { describe, expect, it } from 'vitest'
import { fmtCurrency, fmtDate } from './ancillaryFormat'

describe('fmtCurrency', () => {
  it('formats rupees with Indian grouping and two decimals', () => {
    expect(fmtCurrency(123456.5)).toBe('₹1,23,456.50')
    expect(fmtCurrency(0)).toBe('₹0.00')
  })

  it('shows a dash for a missing value', () => {
    expect(fmtCurrency(null)).toBe('—')
    expect(fmtCurrency(undefined)).toBe('—')
  })
})

describe('fmtDate', () => {
  it('formats an ISO date as an IST date', () => {
    expect(fmtDate('2026-03-14T19:00:00Z')).toBe('15 Mar 2026')
  })
})
