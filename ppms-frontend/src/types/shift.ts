export type FuelType = 'PETROL' | 'SPEED_PETROL' | 'DIESEL' | 'SPEED_DIESEL' | 'CNG'

export type ShiftStatus =
  | 'OPEN'
  | 'OPEN_OVERDUE'
  | 'AUTO_CLOSED_OVERDUE'
  | 'CLOSED_BALANCED'
  | 'CLOSED_DISCREPANCY_PENDING'
  | 'CLOSED_DISCREPANCY_RESOLVED'

export type DiscrepancyType = 'SHORT' | 'OVER'

// ── Nozzle outlet (one fuel type on one nozzle) ──────────────────────────────

export interface NozzleOutlet {
  outletId: number
  fuelType: FuelType
  lastReading: number
  tankId: number | null  // null until mapped in Setup
}

export interface NozzleOption {
  id: number
  pumpId: number
  nozzleNumber: number
  status: string
  maxMeterValue: number
  outlets: NozzleOutlet[]
}

// ── Shift fuel reading (one per outlet) ────────────────────────────────────

export interface FuelReading {
  outletId: number
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

export interface Shift {
  id: number
  pumpId: number
  nozzleId: number
  nozzleNumber: number
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
  nozzleId: number
  operatorId: number
  // fuelReadings removed — backend now uses outlet.lastReading automatically as start reading
}

export interface CloseShiftRequest {
  fuelReadings: Array<{
    outletId: number
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
