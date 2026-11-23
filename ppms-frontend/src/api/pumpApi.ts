import client from './client'
import type { DUOption, FuelType, NozzleDetail } from '../types/shift'

export interface PumpSummary {
  id: number
  name: string
  address: string
  maxDuCount: number
  ownerId: number
  createdAt: string
  discrepancyEscalationThreshold: number | null
  expenseApprovalThreshold: number | null
  /** GST details printed on credit invoices. */
  gstin?: string | null
  legalName?: string | null
  stateName?: string | null
  invoicePrefix?: string | null
  dus: DUOption[]
}

export interface UpdatePumpSettingsRequest {
  discrepancyEscalationThreshold?: number | null
  expenseApprovalThreshold?: number | null
  /** An empty string clears the value; an omitted field is left unchanged. */
  gstin?: string
  legalName?: string
  stateName?: string
  invoicePrefix?: string
}

export interface CreatePumpRequest {
  name: string
  address: string
  maxDuCount: number
}

export interface CreateDURequest {
  name: string
  nozzles: Array<{
    nozzleNumber: number
    fuelType: FuelType
    initialReading?: number
  }>
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

/** What every role can read about a client, and all an operator gets: enough to pick one for a credit sale. */
export interface CreditClientSummary {
  id: number
  pumpId: number
  name: string
  phone: string | null
  /** Null for root/parent accounts. Non-null when this is a sub-account. */
  parentClientId: number | null
  /** Human-readable parent name. Null for root accounts. */
  parentClientName: string | null
  /** True if this root account has sub-accounts. */
  isParent: boolean
  /** False when the client has been soft-disabled. */
  isActive: boolean
}

/** The full account, for roles that can open the Credit page. */
export interface CreditClient extends CreditClientSummary {
  notes: string | null
  createdAt: string
  /** True when the client can check their balance on the public portal. The PIN itself is never returned. */
  hasPortalPin: boolean
  /** Null for an unregistered (B2C) client. */
  gstin?: string | null
  billingAddress?: string | null
}

/** Whether a client could take a credit sale now, by the rules the sale itself is checked against. */
export type CreditStatus = 'OK' | 'OVERDUE' | 'OVER_LIMIT' | 'INACTIVE'

export interface CreditClientStanding {
  clientId: number
  creditStatus: CreditStatus
  /** What the client's group can still take; null when the group has no credit limit. */
  availableCredit: number | null
}

export interface CreateCreditClientRequest {
  name: string
  phone?: string
  notes?: string
  /** When set, this client becomes a sub-account under the specified parent. */
  parentClientId?: number
  gstin?: string
  billingAddress?: string
}

export interface UpdateCreditClientRequest {
  name?: string
  phone?: string
  notes?: string
  /** An empty string removes the value. */
  gstin?: string
  billingAddress?: string
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

/** Response wrapper for POST /api/pumps/{pumpId}/fuel-prices — includes price + optional open-shifts warning. */
export interface SetFuelPriceResponse {
  price: FuelPrice
  openShiftsCount: number
  openShiftsWarning: string | null
}

/** One pump's figures for today in GET /api/pumps/overview. */
export interface PumpOverviewSummary {
  pumpId: number
  name: string
  enabled: boolean
  todaySales: number
  openShiftCount: number
  overdueShiftCount: number
  lowStockTankCount: number
  fuelPricesStale: boolean
}

export interface PumpsOverview {
  pumps: PumpOverviewSummary[]
  totals: {
    todaySales: number
    openShiftCount: number
    overdueShiftCount: number
    lowStockTankCount: number
    stalePricePumpCount: number
  }
}

export type SetupStep =
  | 'DISPENSERS' | 'TANKS' | 'FUEL_PRICES' | 'SHIFT_DEFINITIONS' | 'STAFF' | 'GST_DETAILS' | 'CREDIT_CLIENTS'

/** How far a pump's setup has got; optional steps are not counted in doneCount / requiredCount. */
export interface SetupChecklist {
  pumpId: number
  doneCount: number
  requiredCount: number
  items: { step: SetupStep; done: boolean; optional: boolean; detail: string; detailCode: string; detailParams: Record<string, unknown> }[]
}

export const pumpApi = {
  getMyPumps: () =>
    client.get<PumpSummary[]>('/pumps').then((r) => r.data),

  getSetupChecklist: (pumpId: number) =>
    client.get<SetupChecklist>(`/pumps/${pumpId}/setup-checklist`).then((r) => r.data),

  getPumpsOverview: () =>
    client.get<PumpsOverview>('/pumps/overview').then((r) => r.data),

  createPump: (req: CreatePumpRequest) =>
    client.post<PumpSummary>('/pumps', req).then((r) => r.data),

  deletePump: (pumpId: number) =>
    client.delete(`/pumps/${pumpId}`).then((r) => r.data),

  // ── Dispensary Units ───────────────────────────────────────────────────────

  /** Fetch ALL DUs for a pump (ACTIVE + INACTIVE) — used by the Setup page. */
  getDUs: (pumpId: number) =>
    client.get<DUOption[]>(`/pumps/${pumpId}/dus`).then((r) => r.data),

  createDU: (pumpId: number, req: CreateDURequest) =>
    client.post<DUOption>(`/pumps/${pumpId}/dus`, req).then((r) => r.data),

  /** Enables or disables a DU. Blocked by backend if an active shift exists on any nozzle. */
  updateDUStatus: (pumpId: number, duId: number, status: 'ACTIVE' | 'INACTIVE') =>
    client.patch<DUOption>(`/pumps/${pumpId}/dus/${duId}/status`, { status }).then((r) => r.data),

  // ── Nozzles (within a DU) ──────────────────────────────────────────────────

  addNozzle: (pumpId: number, duId: number, nozzleNumber: number, fuelType: FuelType, initialReading?: number) =>
    client.post<NozzleDetail>(`/pumps/${pumpId}/dus/${duId}/nozzles`, { nozzleNumber, fuelType, initialReading }).then((r) => r.data),

  updateNozzleStatus: (pumpId: number, duId: number, nozzleId: number, status: 'ACTIVE' | 'INACTIVE') =>
    client.patch<NozzleDetail>(`/pumps/${pumpId}/dus/${duId}/nozzles/${nozzleId}/status`, { status }).then((r) => r.data),

  mapNozzleToTank: (pumpId: number, duId: number, nozzleId: number, tankId: number | null) =>
    client.patch<NozzleDetail>(`/pumps/${pumpId}/dus/${duId}/nozzles/${nozzleId}/tank`, { tankId }).then((r) => r.data),

  /** Increases the maximum number of DUs allowed on a pump. */
  updateMaxDuCount: (pumpId: number, maxDuCount: number) =>
    client.patch<PumpSummary>(`/pumps/${pumpId}/max-dus`, { maxDuCount }).then((r) => r.data),

  /** Updates configurable pump thresholds (discrepancy escalation, expense approval). */
  updatePumpSettings: (pumpId: number, req: UpdatePumpSettingsRequest) =>
    client.patch<PumpSummary>(`/pumps/${pumpId}/settings`, req).then((r) => r.data),

  // ── Tanks ──────────────────────────────────────────────────────────────────

  getTanks: (pumpId: number) =>
    client.get<TankInfo[]>(`/pumps/${pumpId}/tanks`).then((r) => r.data),

  createTank: (pumpId: number, req: CreateTankRequest) =>
    client.post<TankInfo>(`/pumps/${pumpId}/tanks`, req).then((r) => r.data),

  updateTank: (pumpId: number, tankId: number, req: UpdateTankRequest) =>
    client.patch<TankInfo>(`/pumps/${pumpId}/tanks/${tankId}`, req).then((r) => r.data),

  updateTankStatus: (pumpId: number, tankId: number, status: 'ACTIVE' | 'INACTIVE') =>
    client.patch<TankInfo>(`/pumps/${pumpId}/tanks/${tankId}/status`, { status }).then((r) => r.data),

  // ── Fuel prices ────────────────────────────────────────────────────────────

  getCurrentPrices: (pumpId: number) =>
    client.get<FuelPrice[]>(`/pumps/${pumpId}/fuel-prices/current`).then((r) => r.data),

  // Returns SetFuelPriceResponse on success (HTTP 201), or throws with response.data = PriceDeviationWarning on HTTP 409
  setFuelPrice: ({ pumpId, ...body }: SetFuelPriceRequest) =>
    client.post<SetFuelPriceResponse>(`/pumps/${pumpId}/fuel-prices`, body).then((r) => r.data),

  // ── Credit clients ─────────────────────────────────────────────────────────

  // Operators get only the summary, so pickers that operators use read this
  getCreditClients: (pumpId: number) =>
    client.get<CreditClientSummary[]>(`/pumps/${pumpId}/credit-clients`).then((r) => r.data),

  // Same list with every account detail; only for roles that can open the Credit page
  getCreditClientAccounts: (pumpId: number) =>
    client.get<CreditClient[]>(`/pumps/${pumpId}/credit-clients`).then((r) => r.data),

  getCreditStanding: (pumpId: number) =>
    client.get<CreditClientStanding[]>(`/pumps/${pumpId}/credit-clients/credit-standing`).then((r) => r.data),

  createCreditClient: (pumpId: number, req: CreateCreditClientRequest) =>
    client.post<CreditClient>(`/pumps/${pumpId}/credit-clients`, req).then((r) => r.data),

  updateCreditClient: (pumpId: number, clientId: number, req: UpdateCreditClientRequest) =>
    client.patch<CreditClient>(`/pumps/${pumpId}/credit-clients/${clientId}`, req).then((r) => r.data),

  deleteCreditClient: (pumpId: number, clientId: number) =>
    client.delete(`/pumps/${pumpId}/credit-clients/${clientId}`).then((r) => r.data),

  toggleCreditClientStatus: (pumpId: number, clientId: number, isActive: boolean) =>
    client.patch<CreditClient>(`/pumps/${pumpId}/credit-clients/${clientId}/status`, { isActive }).then((r) => r.data),

  setCreditClientPortalPin: (pumpId: number, clientId: number, pin: string) =>
    client.put<void>(`/pumps/${pumpId}/credit-clients/${clientId}/portal-pin`, { pin }).then((r) => r.data),

  removeCreditClientPortalPin: (pumpId: number, clientId: number) =>
    client.delete<void>(`/pumps/${pumpId}/credit-clients/${clientId}/portal-pin`).then((r) => r.data),

  reassignCreditEntry: (pumpId: number, entryId: number, toClientId: number, reason: string) =>
    client.post(`/pumps/${pumpId}/credit-ledger/entries/${entryId}/reassign`, { toClientId, reason }).then((r) => r.data),

  reassignCreditPayment: (pumpId: number, paymentId: number, toClientId: number, reason: string) =>
    client.post(`/pumps/${pumpId}/credit-ledger/payments/${paymentId}/reassign`, { toClientId, reason }).then((r) => r.data),
}
