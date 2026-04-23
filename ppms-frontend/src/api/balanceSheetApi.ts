import client from './client'
import type { PagedResponse } from '../types/paged'

// ── Request ────────────────────────────────────────────────────────────────────

export interface GenerateBalanceSheetRequest {
  reportType: 'SHIFT' | 'DAY'
  reportDate: string        // YYYY-MM-DD
  /** ID of the PumpShiftDefinition — required when reportType=SHIFT */
  shiftDefinitionId?: number
  notes?: string
  /** When true, bypasses the duplicate guard and creates a new revision (_2, _3, …) */
  forceRegenerate?: boolean
}

// ── Summary (list view) ────────────────────────────────────────────────────────

export interface BalanceSheetSummary {
  id: number
  reportType: 'SHIFT' | 'DAY'
  reportDate: string
  shiftWindow: string | null
  periodLabel: string
  generatedByUserName: string
  generatedAt: string
  shiftCount: number
  totalLitresSold: number
  totalExpectedRevenue: number
  totalGrossProfit: number
  cashDiscrepancy: number
}

// ── Detail (single report view) ───────────────────────────────────────────────

export interface BsFuelLine {
  fuelType: string
  openingStock: number
  closingStock: number
  deliveredLitres: number
  deliveredCost: number
  soldLitres: number
  sellingPrice: number
  expectedRevenue: number
  costOfGoods: number
  grossProfit: number
  creditSoldAmount: number
  stockVariance: number
  dipLossLitres: number
  dipLossAmount: number
}

export interface NozzleReadingLine {
  nozzleNumber: number
  fuelType: string
  litresSold: number
  expectedRevenue: number
}

export interface BsShiftLine {
  shiftId: number
  operatorName: string
  duNumber: number
  duName: string
  fuelTypesSummary: string
  litresSold: number
  expectedRevenue: number
  cashCollected: number
  upiCollected: number
  cardCollected: number
  fleetCardCollected: number
  creditAmount: number
  discrepancy: number
  nozzleReadings: NozzleReadingLine[]
}

export interface MeterAmendmentLine {
  id: number
  fuelType: string
  adjustmentType: 'RESET' | 'CUSTOM_READING'
  previousReading: number
  newReading: number
  /** Signed: newReading − previousReading. Negative if meter was reset/reduced. */
  delta: number
  reason: string
  recordedByUserName: string
  createdAt: string
}

export interface DipPlLine {
  /** "DIP_CHECK" or "MAINTENANCE_REMOVAL" */
  type: 'DIP_CHECK' | 'MAINTENANCE_REMOVAL'
  fuelType: string
  /** Signed litres: DIP_CHECK = measuredQty − systemStock (+surplus, −shortage); MAINTENANCE_REMOVAL = litresRemoved (positive) */
  litres: number
  /** Signed monetary: negative = loss, positive = gain */
  monetaryAmount: number
  recordedAt: string
  notes: string | null
}

export interface ProductSalesSummary {
  totalRevenue: number
  totalCogs: number
  grossProfit: number
  productLines: Array<{
    productId: number
    productName: string
    unitsSold: number
    revenue: number
    cogs: number
  }>
}

export interface ExpenseSummary {
  totalAmount: number
  lines: Array<{
    id: number
    category: string
    description: string
    amount: number
    recordedByName: string
  }>
}

export interface SettlementLine {
  id: number
  paymentType: 'UPI' | 'CARD' | 'FLEET_CARD'
  amountReceived: number
  notes: string | null
  recordedByUserName: string
  createdAt: string
}

export interface SettlementSummary {
  upiSettledOnDate: number
  cardSettledOnDate: number
  fleetCardSettledOnDate: number
  walletUpiPending: number
  walletCardPending: number
  walletFleetCardPending: number
  settlementsOnDate: SettlementLine[]
}

export interface BalanceSheetDetail {
  id: number
  pumpId: number
  reportType: 'SHIFT' | 'DAY'
  reportDate: string
  shiftWindow: string | null
  periodLabel: string
  generatedByUserName: string
  generatedAt: string
  notes: string | null
  totalExpectedRevenue: number
  totalCashCollected: number
  totalUpiCollected: number
  totalCardCollected: number
  totalFleetCardCollected: number
  totalCreditSold: number
  totalCreditRecovered: number
  cashDiscrepancy: number
  totalLitresSold: number
  totalLitresDelivered: number
  totalCostOfGoods: number
  totalGrossProfit: number
  /** Net Dip P/L: negative = net loss, positive = net gain. Includes DIP_CHECK + MAINTENANCE_REMOVAL. */
  totalDipNetAmount: number
  /** Net profit = fuel gross profit + dip net + ancillary product gross profit (DAY only) − approved expenses (DAY only). */
  totalNetProfit: number
  fuelLines: BsFuelLine[]
  shiftLines: BsShiftLine[]
  meterAmendments: MeterAmendmentLine[]
  /** Individual Dip P/L entries, sorted chronologically. Empty when no dip activity. */
  dipPlEntries: DipPlLine[]
  /** Ancillary product sales summary. Only present for DAY reports. */
  productSales: ProductSalesSummary | null
  /** Approved operational expenses for the report date. Only present for DAY reports. */
  expenses: ExpenseSummary | null
  /**
   * Settlement status for UPI, Card, and Fleet Card on the report date.
   * Shows amounts settled (arrived in bank) on that date and the cumulative wallet balance.
   * Only present for DAY reports.
   */
  settlementSummary: SettlementSummary | null
  /** Distinct shift definition names included in this DAY report. Null for SHIFT reports. */
  includedShiftNames: string[] | null
}

// ── API ────────────────────────────────────────────────────────────────────────

export const balanceSheetApi = {
  generate: (pumpId: number, req: GenerateBalanceSheetRequest) =>
    client.post<BalanceSheetDetail>(`/pumps/${pumpId}/balance-sheets/generate`, req).then(r => r.data),

  list: (pumpId: number, from?: string, to?: string, page = 0, size = 10) => {
    const params: Record<string, string | number> = { page, size }
    if (from) params.from = from
    if (to)   params.to   = to
    return client.get<PagedResponse<BalanceSheetSummary>>(`/pumps/${pumpId}/balance-sheets`, { params }).then(r => r.data)
  },

  getById: (pumpId: number, id: number) =>
    client.get<BalanceSheetDetail>(`/pumps/${pumpId}/balance-sheets/${id}`).then(r => r.data),

  delete: (pumpId: number, id: number) =>
    client.delete(`/pumps/${pumpId}/balance-sheets/${id}`).then(r => r.data),
}
