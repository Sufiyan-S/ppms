import client from './client'

// ── Onboard Owner ─────────────────────────────────────────────────────────────

export interface OnboardOwnerRequest {
  fullName: string
  phoneNumber: string
  password: string
  pumpName: string
  pumpAddress: string
  maxNozzleCount: number
}

export interface OnboardOwnerResponse {
  ownerId: number
  employeeId: string
  fullName: string
  phoneNumber: string
  pumpId: number
  pumpName: string
  createdAt: string
}

// ── Owner List ────────────────────────────────────────────────────────────────

export interface PumpSummary {
  pumpId: number
  pumpName: string
  pumpAddress: string
  enabled: boolean
  staffCount: number
}

export interface OwnerSummary {
  ownerId: number
  employeeId: string
  fullName: string
  phoneNumber: string
  status: string
  createdAt: string
  pumps: PumpSummary[]
}

// ── Add Pump to Existing Owner ────────────────────────────────────────────────

export interface AddPumpRequest {
  pumpName: string
  pumpAddress: string
  maxNozzleCount: number
}

// ── Update Pump (SuperAdmin) ───────────────────────────────────────────────────

export interface UpdatePumpRequest {
  pumpName: string
  pumpAddress: string
  enabled: boolean
}

// ── API ───────────────────────────────────────────────────────────────────────

export const superAdminApi = {
  onboardOwner: (request: OnboardOwnerRequest) =>
    client.post<OnboardOwnerResponse>('/super-admin/onboard-owner', request).then(r => r.data),

  listOwners: () =>
    client.get<OwnerSummary[]>('/super-admin/owners').then(r => r.data),

  addPumpToOwner: (ownerId: number, request: AddPumpRequest) =>
    client.post<OwnerSummary>(`/super-admin/owners/${ownerId}/pumps`, request).then(r => r.data),

  updatePump: (pumpId: number, request: UpdatePumpRequest) =>
    client.patch<OwnerSummary>(`/super-admin/pumps/${pumpId}`, request).then(r => r.data),
}
