import type { CreateUserRequest, UserGender } from '../../../api/userApi'

// ── Staff content ─────────────────────────────────────────────────────────────

export const ROLE_BADGE: Record<string, string> = {
  OPERATOR:   'bg-green-100 text-green-700',
  MANAGER:    'bg-blue-100 text-blue-700',
  ADMIN:      'bg-purple-100 text-purple-700',
  ACCOUNTANT: 'bg-orange-100 text-orange-700',
}

export type StaffCreateForm = Omit<CreateUserRequest, 'assignedPumpId' | 'gender'> & {
  gender: UserGender | ''
}

export const EMPTY_FORM: StaffCreateForm = {
  fullName: '',
  phoneNumber: '',
  password: '',
  gender: '',
  nightShiftConsent: false,
  role: 'OPERATOR' as const,
}

export type StaffPanel = 'preferences' | 'leave' | 'rates' | 'edit'
