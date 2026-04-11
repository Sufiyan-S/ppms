import client from './client'

// ── P&L Report ────────────────────────────────────────────────────────────────

export interface ProfitLossFuelLine {
  fuelType: string
  revenue: number
  cogs: number
  grossProfit: number
}

export interface ProfitLossReport {
  pumpId: number
  from: string
  to: string
  totalShifts: number
  totalRevenue: number
  totalCogs: number
  grossProfit: number
  byFuelType: ProfitLossFuelLine[]
}

// ── Operator Duty Report ──────────────────────────────────────────────────────

export interface OperatorDutyShiftLine {
  shiftId: number
  shiftDate: string
  shiftWindow: string | null
  actualStartTime: string | null
  actualEndTime: string | null
  totalAmountDue: number
  cashCollected: number
  upiCollected: number
  cardCollected: number
  creditTotal: number
  discrepancyAmount: number
  discrepancyType: string | null
  status: string
}

export interface OperatorDutyReport {
  pumpId: number
  operatorId: number
  operatorName: string
  from: string
  to: string
  totalShifts: number
  totalAmountDue: number
  totalDiscrepancy: number
  shifts: OperatorDutyShiftLine[]
}

// ── Operator Discrepancy Report ───────────────────────────────────────────────

export interface DiscrepancyLine {
  shiftId: number
  shiftDate: string
  shiftWindow: string | null
  discrepancyType: string
  discrepancyAmount: number
  discrepancyReason: string | null
  status: string
  resolution: string | null
}

export interface OperatorDiscrepancySummary {
  operatorId: number
  operatorName: string
  discrepancyShiftCount: number
  totalShortAmount: number
  totalOverAmount: number
  unresolvedCount: number
  shifts: DiscrepancyLine[]
}

export interface OperatorDiscrepancyReport {
  pumpId: number
  from: string
  to: string
  totalDiscrepancyShifts: number
  operators: OperatorDiscrepancySummary[]
}

// ── Inventory Lots Report ─────────────────────────────────────────────────────

export interface ConsumptionLine {
  id: number
  sourceType: string
  shiftId: number | null
  shiftName: string | null
  quantityConsumed: number
  costPricePerUnit: number
  totalCost: number
  consumedAt: string
}

export interface InventoryLotLine {
  lotId: number
  fuelType: string
  deliveryDate: string
  originalQuantity: number
  remainingQuantity: number
  totalConsumed: number
  costPricePerUnit: number
  totalCogsConsumed: number
  status: string
  isDipAdjustment: boolean
  consumptions: ConsumptionLine[]
}

export interface InventoryLotsReport {
  tankId: number
  totalLots: number
  lots: InventoryLotLine[]
}

// ── Dip P/L Report ────────────────────────────────────────────────────────────

export interface DipPlEntry {
  /** "DIP_CHECK" or "MAINTENANCE_REMOVAL" */
  type: 'DIP_CHECK' | 'MAINTENANCE_REMOVAL'
  fuelType: string
  /** Signed litres: DIP_CHECK = measuredQty − systemStock (+surplus, −shortage); MAINTENANCE_REMOVAL = litresRemoved */
  litres: number
  /** Signed monetary: negative = loss, positive = gain */
  monetaryAmount: number
  recordedAt: string
  notes: string | null
}

// ── Shifts Report ─────────────────────────────────────────────────────────────

export interface ShiftReportLine {
  id: number
  shiftDate: string
  shiftName: string | null
  status: string | null
  totalAmountDue: number
  cashCollected: number
  upiCollected: number
  cardCollected: number
  creditTotal: number
  discrepancyAmount: number | null
  discrepancyType: string | null
}

// ── Expenses Report ────────────────────────────────────────────────────────────

export interface ExpenseReportLine {
  id: number
  expenseDate: string
  category: string | null
  amount: number
  description: string
  approvalStatus: string | null
}

// ── Interest Accrual Report ───────────────────────────────────────────────────

export interface InterestChargeLine {
  id: number
  periodFrom: string
  periodTo: string
  outstandingBalance: number
  rateApplied: number
  daysApplied: number
  amount: number
  source: string
}

export interface InterestAccrualClientLine {
  clientId: number
  clientName: string
  chargeCount: number
  totalInterest: number
  charges: InterestChargeLine[]
}

export interface InterestAccrualReport {
  pumpId: number
  from: string
  to: string
  totalCharges: number
  totalInterest: number
  clients: InterestAccrualClientLine[]
}

// ── API ───────────────────────────────────────────────────────────────────────

export const reportApi = {
  getProfitLoss: (pumpId: number, from: string, to: string) =>
    client.get<ProfitLossReport>(`/pumps/${pumpId}/reports/profit-loss`, { params: { from, to } }).then(r => r.data),

  getOperatorDuty: (pumpId: number, operatorId: number, from: string, to: string) =>
    client.get<OperatorDutyReport>(`/pumps/${pumpId}/reports/operator-duty`, { params: { operatorId, from, to } }).then(r => r.data),

  getOperatorDiscrepancy: (pumpId: number, from: string, to: string) =>
    client.get<OperatorDiscrepancyReport>(`/pumps/${pumpId}/reports/operator-discrepancy`, { params: { from, to } }).then(r => r.data),

  getInventoryLots: (pumpId: number, tankId: number) =>
    client.get<InventoryLotsReport>(`/pumps/${pumpId}/reports/inventory-lots`, { params: { tankId } }).then(r => r.data),

  getDipPl: (pumpId: number, from: string, to: string) =>
    client.get<DipPlEntry[]>(`/pumps/${pumpId}/reports/dip-pl`, { params: { from, to } }).then(r => r.data),

  getShiftsReport: (pumpId: number, from: string, to: string) =>
    client.get<ShiftReportLine[]>(`/pumps/${pumpId}/reports/shifts`, { params: { from, to } }).then(r => r.data),

  getExpensesReport: (pumpId: number, from: string, to: string) =>
    client.get<ExpenseReportLine[]>(`/pumps/${pumpId}/reports/expenses`, { params: { from, to } }).then(r => r.data),

  getInterestAccrual: (pumpId: number, from: string, to: string) =>
    client.get<InterestAccrualReport>(`/pumps/${pumpId}/reports/interest-accrual`, { params: { from, to } }).then(r => r.data),
}
