import { describe, expect, it } from 'vitest'
import type { UserRole } from '../types/auth'
import { ACTION_PERMISSIONS, PAGE_PERMISSIONS, canAccessPage, canPerformAction, getDefaultPath } from './permissions'

describe('getDefaultPath', () => {
  it.each<[UserRole | undefined, string]>([
    [undefined, '/login'],
    ['SUPER_ADMIN', '/super-admin'],
    ['OWNER', '/dashboard'],
    ['ADMIN', '/dashboard'],
    ['MANAGER', '/dashboard'],
    ['OPERATOR', '/dashboard/shifts'],
    ['ACCOUNTANT', '/dashboard/credit'],
  ])('sends %s to %s', (role, path) => {
    expect(getDefaultPath(role)).toBe(path)
  })

  it('sends every role to a page that role can open', () => {
    const roles: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT']
    for (const role of roles) {
      expect(getDefaultPath(role)).not.toBe('/login')
    }
  })
})

describe('canAccessPage', () => {
  it('lets SUPER_ADMIN open every page and nobody open a page without a role', () => {
    for (const page of Object.keys(PAGE_PERMISSIONS)) {
      expect(canAccessPage(page, 'SUPER_ADMIN')).toBe(true)
      expect(canAccessPage(page, undefined)).toBe(false)
    }
  })

  it('limits payroll to OWNER', () => {
    expect(canAccessPage('payroll', 'OWNER')).toBe(true)
    expect(canAccessPage('payroll', 'ADMIN')).toBe(false)
  })

  it('keeps ACCOUNTANT to credit and expenses', () => {
    const allowed = Object.keys(PAGE_PERMISSIONS).filter(page => canAccessPage(page, 'ACCOUNTANT'))
    expect(allowed.sort()).toEqual(['credit', 'expenses'])
  })

  it('denies an unknown page', () => {
    expect(canAccessPage('nope', 'OWNER')).toBe(false)
  })
})

describe('canPerformAction', () => {
  it.each<[string, UserRole, boolean]>([
    ['credit:approve-payment', 'OWNER', true],
    ['credit:approve-payment', 'ADMIN', true],
    ['credit:approve-payment', 'MANAGER', false],
    ['credit:approve-payment', 'ACCOUNTANT', false],
    ['shift:close', 'MANAGER', true],
    ['shift:close', 'OPERATOR', false],
    ['shift:add-credit-entry', 'OPERATOR', true],
    ['product:record-sale', 'MANAGER', true],
    ['product:record-sale', 'OPERATOR', false],
    ['expense:delete', 'OWNER', true],
    ['expense:delete', 'ADMIN', false],
    ['payroll:generate', 'ADMIN', false],
    ['settlement:void', 'MANAGER', false],
    ['setup:manage', 'MANAGER', false],
  ])('%s for %s is %s', (action, role, expected) => {
    expect(canPerformAction(action, role)).toBe(expected)
  })

  it('lets SUPER_ADMIN do every action and denies a missing role', () => {
    for (const action of Object.keys(ACTION_PERMISSIONS)) {
      expect(canPerformAction(action, 'SUPER_ADMIN')).toBe(true)
      expect(canPerformAction(action, undefined)).toBe(false)
    }
  })

  it('denies an unknown action', () => {
    expect(canPerformAction('unknown:thing', 'OWNER')).toBe(false)
  })
})
