import { describe, expect, it } from 'vitest'
import type { StaffMember } from '../../../api/userApi'
import { avatarTint, filterStaff, NO_STAFF_FILTERS, staffInitials } from './staffList'

const person = (id: number, fullName: string, role: string, status = 'ACTIVE', phoneNumber: string | null = null): StaffMember => ({
  id, employeeId: `EMP-${id}`, fullName, phoneNumber, gender: null, nightShiftConsent: false, role, assignedPumpId: 2, status,
  dailyRate: null, shift1HourlyRate: null, standardHourlyRate: null,
})

const staff = [
  person(1, 'Ravi Kumar', 'OPERATOR', 'ACTIVE', '9876543210'),
  person(2, 'Sunita Patil', 'MANAGER'),
  person(3, 'Amit', 'OPERATOR', 'INACTIVE'),
]

describe('staffInitials', () => {
  it('takes the first and last names’ initials, or one letter for a single name', () => {
    expect(staffInitials('Ravi Kumar')).toBe('RK')
    expect(staffInitials('  sunita   devi patil ')).toBe('SP')
    expect(staffInitials('Amit')).toBe('A')
    expect(staffInitials('')).toBe('?')
  })
})

describe('avatarTint', () => {
  it('gives the same name the same token tint every time', () => {
    expect(avatarTint('Ravi Kumar')).toBe(avatarTint('Ravi Kumar'))
    expect(avatarTint('Ravi Kumar')).toMatch(/^bg-\S+ text-\S+$/)
  })
})

describe('filterStaff', () => {
  it('keeps everyone with no filters', () => {
    expect(filterStaff(staff, NO_STAFF_FILTERS)).toHaveLength(3)
  })

  it('searches name, phone and employee ID, ignoring case', () => {
    expect(filterStaff(staff, { ...NO_STAFF_FILTERS, search: 'patil' }).map((m) => m.id)).toEqual([2])
    expect(filterStaff(staff, { ...NO_STAFF_FILTERS, search: '98765' }).map((m) => m.id)).toEqual([1])
    expect(filterStaff(staff, { ...NO_STAFF_FILTERS, search: 'emp-3' }).map((m) => m.id)).toEqual([3])
  })

  it('narrows by role and by status together', () => {
    expect(filterStaff(staff, { ...NO_STAFF_FILTERS, role: 'OPERATOR' }).map((m) => m.id)).toEqual([1, 3])
    expect(filterStaff(staff, { ...NO_STAFF_FILTERS, role: 'OPERATOR', status: 'INACTIVE' }).map((m) => m.id)).toEqual([3])
    expect(filterStaff(staff, { ...NO_STAFF_FILTERS, status: 'ACTIVE' }).map((m) => m.id)).toEqual([1, 2])
  })
})
