import client from './client'

export type UserGender = 'MALE' | 'FEMALE' | 'OTHER'

export interface StaffMember {
  id: number
  employeeId: string
  fullName: string
  phoneNumber: string
  gender: UserGender | null
  nightShiftConsent: boolean
  role: string
  assignedPumpId: number | null
  status: string
  dailyRate: number | null           // MANAGER / ADMIN / ACCOUNTANT
  shift1HourlyRate: number | null    // OPERATOR — night shift
  standardHourlyRate: number | null  // OPERATOR — day shifts
}

export interface UpdateStaffDetailsRequest {
  fullName?: string
  phoneNumber?: string
  role?: 'OPERATOR' | 'MANAGER' | 'ADMIN' | 'ACCOUNTANT'
  gender?: UserGender
  nightShiftConsent?: boolean
}

export interface CreateUserRequest {
  fullName: string
  phoneNumber: string
  password: string
  gender: UserGender
  nightShiftConsent?: boolean
  role: 'OPERATOR' | 'MANAGER' | 'ADMIN' | 'ACCOUNTANT'
  assignedPumpId: number
  address?: string
  employeeId?: string
}

export const userApi = {
  getOperators: (pumpId: number) =>
    client.get<StaffMember[]>('/users/operators', { params: { pumpId } }).then((r) => r.data),

  getStaff: (pumpId: number) =>
    client.get<StaffMember[]>('/users/staff', { params: { pumpId } }).then((r) => r.data),

  createUser: (req: CreateUserRequest) =>
    client.post<StaffMember>('/users', req).then((r) => r.data),

  // Activate or deactivate a staff member (Owner only)
  updateUserStatus: (userId: number, status: 'ACTIVE' | 'INACTIVE') =>
    client.patch<StaffMember>(`/users/${userId}/status`, { status }).then((r) => r.data),

  // Update the currently logged-in user's own display name
  updateMyProfile: (fullName: string) =>
    client.patch<StaffMember>('/users/me/profile', { fullName }).then((r) => r.data),

  // Update name, phone, or role for a staff member (Owner / Admin)
  updateStaffDetails: (userId: number, req: UpdateStaffDetailsRequest) =>
    client.patch<StaffMember>(`/users/${userId}/details`, req).then((r) => r.data),

  // Set pay rates for a staff member (Owner only).
  // Operators: pass shift1HourlyRate + standardHourlyRate.
  // Managers/Admins/Accountants: pass dailyRate.
  updatePayRates: (userId: number, rates: { shift1HourlyRate?: number; standardHourlyRate?: number; dailyRate?: number }) =>
    client.patch<StaffMember>(`/users/${userId}/pay-rates`, rates).then((r) => r.data),
}
