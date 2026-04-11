import client from './client'
import type { NozzleOption, FuelType } from '../types/shift'

export interface PumpSummary {
  id: number
  name: string
  address: string
  maxNozzleCount: number
  ownerId: number
  createdAt: string
  nozzles: NozzleOption[]
}

export interface CreatePumpRequest {
  name: string
  address: string
  maxNozzleCount: number
}

export interface CreateNozzleRequest {
  nozzleNumber: number
  /** 1–4 non-CNG types, OR exactly 1 CNG */
  fuelTypes: FuelType[]
  /** Initial meter reading per outlet — use when meter already shows a non-zero value at setup */
  startReadings?: Partial<Record<FuelType, number>>
  maxMeterValue?: number
}

export interface AddNozzleOutletRequest {
  fuelType: FuelType
  initialReading?: number
}

export interface UpdateOutletReadingRequest {
  reading: number
}

export interface TankInfo {
  id: number
  pumpId: number
  tankIdentifier: string
  fuelType: FuelType
  capacity: number
  currentStock: number
  dipTolerance: number
  status: string
  createdAt: string
}

export interface CreateTankRequest {
  tankIdentifier: string
  fuelType: FuelType
  capacity: number
  dipTolerance?: number
}

export interface UpdateTankRequest {
  capacity: number
  tankIdentifier?: string
}

export interface CreditClient {
  id: number
  pumpId: number
  name: string
  phone: string | null
  notes: string | null
  createdAt: string
  /** Null for root/parent accounts. Non-null when this is a sub-account. */
  parentClientId: number | null
  /** Human-readable parent name. Null for root accounts. */
  parentClientName: string | null
  /** True if this root account has sub-accounts. */
  isParent: boolean
}

export interface CreateCreditClientRequest {
  name: string
  phone?: string
  notes?: string
  /** When set, this client becomes a sub-account under the specified parent. */
  parentClientId?: number
}

export interface UpdateCreditClientRequest {
  name?: string
  phone?: string
  notes?: string
}

export interface SetFuelPriceRequest {
  pumpId: number
  fuelType: FuelType
  pricePerUnit: number
  /** Pass true to bypass the 15% deviation guard (after user confirms). */
  confirmed?: boolean
}

export interface PriceDeviationWarning {
  message: string
  lastPrice: number
  newPrice: number
  deviationPercent: number
}

export interface FuelPrice {
  id: number
  pumpId: number
  fuelType: string
  pricePerUnit: number
  effectiveFrom: string
  setByUserId: number
}

/** Response wrapper for POST /api/fuel-prices — includes price + optional open-shifts warning. */
export interface SetFuelPriceResponse {
  price: FuelPrice
  openShiftsCount: number
  openShiftsWarning: string | null
}

export const pumpApi = {
  getMyPumps: () =>
    client.get<PumpSummary[]>('/pumps').then((r) => r.data),

  createPump: (req: CreatePumpRequest) =>
    client.post<PumpSummary>('/pumps', req).then((r) => r.data),

  deletePump: (pumpId: number) =>
    client.delete(`/pumps/${pumpId}`).then((r) => r.data),

  // ── Nozzles ────────────────────────────────────────────────────────────────

  /** Fetch ALL nozzles for a pump (ACTIVE + INACTIVE) — used by the Setup page. */
  getNozzles: (pumpId: number) =>
    client.get<NozzleOption[]>(`/pumps/${pumpId}/nozzles`).then((r) => r.data),

  addNozzle: (pumpId: number, req: CreateNozzleRequest) =>
    client.post<NozzleOption>(`/pumps/${pumpId}/nozzles`, req).then((r) => r.data),

  addOutlet: (nozzleId: number, req: AddNozzleOutletRequest) =>
    client.post<NozzleOption>(`/pumps/nozzles/${nozzleId}/outlets`, req).then((r) => r.data),

  removeOutlet: (nozzleId: number, outletId: number) =>
    client.delete<NozzleOption>(`/pumps/nozzles/${nozzleId}/outlets/${outletId}`).then((r) => r.data),

  updateOutletReading: (nozzleId: number, outletId: number, req: UpdateOutletReadingRequest) =>
    client.put<NozzleOption>(`/pumps/nozzles/${nozzleId}/outlets/${outletId}/reading`, req).then((r) => r.data),

  /** Maps (or clears) the tank an outlet draws fuel from. Pass tankId=null to clear. */
  mapOutletToTank: (nozzleId: number, outletId: number, tankId: number | null) =>
    client.patch<NozzleOption>(`/pumps/nozzles/${nozzleId}/outlets/${outletId}/tank`, { tankId }).then((r) => r.data),

  /** Enables or disables a nozzle. Blocked by backend if an active shift exists. */
  updateNozzleStatus: (nozzleId: number, status: 'ACTIVE' | 'INACTIVE') =>
    client.patch<NozzleOption>(`/pumps/nozzles/${nozzleId}/status`, { status }).then((r) => r.data),

  /** Increases the maximum number of nozzles allowed on a pump. */
  updateMaxNozzleCount: (pumpId: number, maxNozzleCount: number) =>
    client.patch<PumpSummary>(`/pumps/${pumpId}/max-nozzles`, { maxNozzleCount }).then((r) => r.data),

  // ── Tanks ──────────────────────────────────────────────────────────────────

  getTanks: (pumpId: number) =>
    client.get<TankInfo[]>(`/pumps/${pumpId}/tanks`).then((r) => r.data),

  createTank: (pumpId: number, req: CreateTankRequest) =>
    client.post<TankInfo>(`/pumps/${pumpId}/tanks`, req).then((r) => r.data),

  updateTank: (tankId: number, req: UpdateTankRequest) =>
    client.patch<TankInfo>(`/pumps/tanks/${tankId}`, req).then((r) => r.data),

  updateTankStatus: (tankId: number, status: 'ACTIVE' | 'INACTIVE') =>
    client.patch<TankInfo>(`/pumps/tanks/${tankId}/status`, { status }).then((r) => r.data),

  // ── Fuel prices ────────────────────────────────────────────────────────────

  getCurrentPrices: (pumpId: number) =>
    client.get<FuelPrice[]>('/fuel-prices/current', { params: { pumpId } }).then((r) => r.data),

  // Returns SetFuelPriceResponse on success (HTTP 201), or throws with response.data = PriceDeviationWarning on HTTP 409
  setFuelPrice: (req: SetFuelPriceRequest) =>
    client.post<SetFuelPriceResponse>('/fuel-prices', req).then((r) => r.data),

  // ── Credit clients ─────────────────────────────────────────────────────────

  getCreditClients: (pumpId: number) =>
    client.get<CreditClient[]>(`/pumps/${pumpId}/credit-clients`).then((r) => r.data),

  createCreditClient: (pumpId: number, req: CreateCreditClientRequest) =>
    client.post<CreditClient>(`/pumps/${pumpId}/credit-clients`, req).then((r) => r.data),

  updateCreditClient: (pumpId: number, clientId: number, req: UpdateCreditClientRequest) =>
    client.patch<CreditClient>(`/pumps/${pumpId}/credit-clients/${clientId}`, req).then((r) => r.data),

  deleteCreditClient: (pumpId: number, clientId: number) =>
    client.delete(`/pumps/${pumpId}/credit-clients/${clientId}`).then((r) => r.data),

  reassignCreditEntry: (pumpId: number, entryId: number, toClientId: number, reason: string) =>
    client.post(`/pumps/${pumpId}/credit-ledger/entries/${entryId}/reassign`, { toClientId, reason }).then((r) => r.data),

  reassignCreditPayment: (pumpId: number, paymentId: number, toClientId: number, reason: string) =>
    client.post(`/pumps/${pumpId}/credit-ledger/payments/${paymentId}/reassign`, { toClientId, reason }).then((r) => r.data),
}
