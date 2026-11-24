import type { StaffMember } from '../../../api/userApi'

const AVATAR_TINTS = [
  'bg-info-bg text-info',
  'bg-ok-bg text-ok',
  'bg-warn-bg text-warn',
  'bg-neutral-bg text-neutral',
  'bg-accent/20 text-warn-strong',
]

/** Up to two letters: the first and last names' initials, or the first letter of a single name. */
export function staffInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : ''
  return `${words[0].charAt(0)}${last}`.toLocaleUpperCase()
}

/** The same tint for the same name on every visit, so a person is easy to spot again in the list. */
export function avatarTint(fullName: string): string {
  let hash = 0
  for (const char of fullName) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_003
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]
}

export type StaffStatusFilter = 'all' | 'ACTIVE' | 'INACTIVE'

export interface StaffFilters {
  search: string
  role: string
  status: StaffStatusFilter
}

export const NO_STAFF_FILTERS: StaffFilters = { search: '', role: 'all', status: 'all' }

/** The search matches name, phone or employee ID; the role and status chips narrow the list further. */
export function filterStaff(staff: StaffMember[], { search, role, status }: StaffFilters): StaffMember[] {
  const needle = search.trim().toLocaleLowerCase()
  return staff.filter((member) => {
    if (role !== 'all' && member.role !== role) return false
    const isInactive = member.status === 'INACTIVE'
    if (status === 'ACTIVE' && isInactive) return false
    if (status === 'INACTIVE' && !isInactive) return false
    return !needle || [member.fullName, member.phoneNumber, member.employeeId]
      .some((value) => value?.toLocaleLowerCase().includes(needle))
  })
}
