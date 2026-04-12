export type FuelType = 'PETROL' | 'SPEED_PETROL' | 'DIESEL' | 'SPEED_DIESEL' | 'CNG'

export type ShiftStatus =
  | 'OPEN'
  | 'OPEN_OVERDUE'
  | 'AUTO_CLOSED_OVERDUE'
  | 'CLOSED_BALANCED'
  | 'CLOSED_DISCREPANCY_PENDING'
  | 'CLOSED_DISCREPANCY_RESOLVED'

export type DiscrepancyType = 'SHORT' | 'OVER'

// ── Nozzle on a Dispensary Unit ───────────────────────────────────────────────

export interface NozzleDetail {
  id: number
  nozzleNumber: number
  fuelType: FuelType
  lastReading: number
  maxMeterValue: number
  tankId: number | null
  status: string
}

// ── Dispensary Unit (DU) — the physical MPD machine ──────────────────────────

export interface DUOption {
  id: number
  pumpId: number
  duNumber: number
  name: string
  status: string
  nozzles: NozzleDetail[]
}

// ── Shift fuel reading (one per nozzle) ────────────────────────────────────

export interface FuelReading {
  nozzleId: number
  fuelType: FuelType
  startReading: number
  endReading: number | null
  priceSnapshot: number
  unitsSold: number | null
}

// ── Shift ──────────────────────────────────────────────────────────────────

export interface CreditEntry {
  id: number
  clientName: string
  billNo: string | null
  amount: number
  fuelType: string | null
  description: string | null
  voidStatus: 'ACTIVE' | 'VOIDED'
  voidReason: string | null
}

export interface CreditEntryInput {
  clientName: string
  /** Preferred over name-based lookup when a sub-account is explicitly selected. */
  clientId?: number
  billNo?: string
  amount: number
  fuelType?: string
  description?: string
}

export interface NozzleSummary {
  id: number
  nozzleNumber: number
  fuelType: string
}

export interface Shift {
  id: number
  pumpId: number
  duId: number
  duNumber: number | null
  duName: string | null
  nozzles: NozzleSummary[]
  operatorId: number
  operatorName: string
  openedByUserName: string
  shiftWindow: string
  shiftDate: string
  actualStartTime: string
  actualEndTime: string | null
  fuelReadings: FuelReading[]
  totalAmountDue: number | null
  cashCollected: number | null
  upiCollected: number | null
  cardCollected: number | null
  fleetCardCollected: number | null
  creditTotal: number | null
  discrepancyAmount: number | null
  discrepancyType: DiscrepancyType | null
  discrepancyReason: string | null
  discrepancyResolution: string | null
  discrepancyResolutionNote: string | null
  status: ShiftStatus
  creditEntries: CreditEntry[]
}

// ── API Request types ───────────────────────────────────────────────────────

export interface OpenShiftRequest {
  duId: number
  nozzleIds: number[]
  operatorId: number
}

export interface CloseShiftRequest {
  fuelReadings: Array<{
    nozzleId: number
    endReading: number
  }>
  cashCollected: number
  upiCollected: number
  cardCollected: number
  fleetCardCollected: number
  creditTotal: number
  creditEntries: CreditEntryInput[]
  discrepancyReason?: string
}
