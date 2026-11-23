import type { CreateUserRequest, UserGender } from '../../../api/userApi'

// ── Staff content ─────────────────────────────────────────────────────────────

export const ROLE_BADGE: Record<string, string> = {
  OPERATOR:   'bg-ok-bg text-ok',
  MANAGER:    'bg-info-bg text-info',
  ADMIN:      'bg-info-bg text-info',
  ACCOUNTANT: 'bg-warn-bg text-warn',
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
  preferredLanguage: 'en',
}

export type StaffPanel = 'preferences' | 'leave' | 'rates' | 'edit' | 'move' | 'deactivate'
