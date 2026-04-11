export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'ACCOUNTANT'

export interface AuthUser {
  userId: number
  fullName: string
  phoneNumber: string
  role: UserRole
  assignedPumpId: number | null
}

export interface LoginRequest {
  phoneNumber: string
  password: string
}

export interface LoginResponse {
  token: string
  userId: number
  fullName: string
  phoneNumber: string
  role: UserRole
  assignedPumpId: number | null
}
