import { describe, expect, it } from 'vitest'
import { auditEntityLabel, auditEntityUrl, discrepanciesUrl, shiftUrl, shiftsForFuelUrl } from './drillDown'

const october = { from: '2026-10-01', to: '2026-10-31' }

describe('drill-down links', () => {
  it('opens all-shifts history for a fuel over the report range', () => {
    expect(shiftsForFuelUrl(october, 'PETROL'))
      .toBe('/dashboard/shifts?history=all&from=2026-10-01&to=2026-10-31&fuel=PETROL')
  })

  it('opens one shift', () => {
    expect(shiftUrl(123)).toBe('/dashboard/shifts?shift=123')
  })

  it('opens the discrepancies tab for the range, optionally only short or over', () => {
    expect(discrepanciesUrl(october)).toBe('/dashboard/shifts?history=discrepancies&from=2026-10-01&to=2026-10-31')
    expect(discrepanciesUrl(october, 'SHORT'))
      .toBe('/dashboard/shifts?history=discrepancies&from=2026-10-01&to=2026-10-31&type=SHORT')
  })
})

describe('audit entity links', () => {
  it('links entities that have a page', () => {
    expect(auditEntityUrl('Shift', '123')).toBe('/dashboard/shifts?shift=123')
    expect(auditEntityUrl('User', '6')).toBe('/dashboard/setup?section=staff')
    expect(auditEntityUrl('CreditClient', '9')).toBe('/dashboard/credit/9')
    expect(auditEntityUrl('PumpExpense', '4')).toBe('/dashboard/expenses')
  })

  it('leaves entities without a page or without an id as plain text', () => {
    expect(auditEntityUrl('BankStatementImport', '2')).toBeNull()
    expect(auditEntityUrl('Shift', null)).toBeNull()
  })

  it('names entities in plain words', () => {
    expect(auditEntityLabel('Shift', '123')).toBe('Shift #123')
    expect(auditEntityLabel('PumpExpense', '4')).toBe('Expense #4')
  })
})
