import { describe, expect, it } from 'vitest'
import { codeLabel, roleLabel } from './labels'

describe('codeLabel', () => {
  it('turns an enum code into sentence case', () => {
    expect(codeLabel('MAINTENANCE')).toBe('Maintenance')
    expect(codeLabel('PENDING_APPROVAL')).toBe('Pending approval')
    expect(codeLabel('FLEET_CARD')).toBe('Fleet card')
  })

  it('keeps abbreviations and fuel names as people write them', () => {
    expect(codeLabel('UPI')).toBe('UPI')
    expect(codeLabel('CNG')).toBe('CNG')
    expect(codeLabel('PETROL')).toBe('Petrol')
  })

  it('shows a dash for a missing code unless told otherwise', () => {
    expect(codeLabel(null)).toBe('—')
    expect(codeLabel(undefined, 'None')).toBe('None')
  })

  it('labels roles', () => {
    expect(roleLabel('SUPER_ADMIN')).toBe('Super admin')
    expect(roleLabel('OWNER')).toBe('Owner')
  })
})
