import type { DateRange } from './datePresets'

const SHIFTS_PATH = '/dashboard/shifts'

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([name, value]) => { if (value) query.set(name, value) })
  const text = query.toString()
  return text ? `${path}?${text}` : path
}

/** Shift history, All Shifts tab, limited to shifts in the range that sold the fuel. */
export function shiftsForFuelUrl(range: DateRange, fuelType: string): string {
  return withQuery(SHIFTS_PATH, { history: 'all', from: range.from, to: range.to, fuel: fuelType })
}

export function shiftUrl(shiftId: number | string): string {
  return withQuery(SHIFTS_PATH, { shift: String(shiftId) })
}

/** Shift history, Discrepancies tab, for the range and optionally only short or only over. */
export function discrepanciesUrl(range: DateRange, type?: 'SHORT' | 'OVER'): string {
  return withQuery(SHIFTS_PATH, { history: 'discrepancies', from: range.from, to: range.to, type })
}

const ENTITY_PAGES: Record<string, (id: string) => string> = {
  Shift:                   (id) => shiftUrl(id),
  ShiftHandover:           () => SHIFTS_PATH,
  ShiftCreditEntry:        () => SHIFTS_PATH,
  User:                    () => '/dashboard/setup?section=staff',
  CreditClient:            (id) => `/dashboard/credit/${encodeURIComponent(id)}`,
  PaymentSettlement:       () => '/dashboard/settlements',
  PaymentSettlementConfig: () => '/dashboard/settlements',
  PumpExpense:             () => '/dashboard/expenses',
  PumpDocument:            () => '/dashboard/documents',
  TankerDelivery:          () => '/dashboard/inventory',
  PayrollRecord:           () => '/dashboard/payroll',
  NozzleCalibrationLog:    () => '/dashboard/calibration',
  FuelPrice:               () => '/dashboard/setup?section=prices',
  GlobalFuelPrice:         () => '/dashboard/setup?section=prices',
  UndergroundTank:         () => '/dashboard/setup?section=tanks',
  Nozzle:                  () => '/dashboard/setup?section=nozzles',
  DispensaryUnit:          () => '/dashboard/setup?section=nozzles',
  AncillaryProduct:        () => '/dashboard/ancillary',
  AncillarySale:           () => '/dashboard/ancillary',
  AncillaryStockLot:       () => '/dashboard/ancillary',
  AncillaryStockDelivery:  () => '/dashboard/ancillary',
}

/** The page an audit log entry's entity ("Shift #123") opens, or null when it has no page of its own. */
export function auditEntityUrl(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null
  return ENTITY_PAGES[entityType]?.(entityId) ?? null
}

const ENTITY_LABELS: Record<string, string> = {
  PumpExpense: 'Expense',
  PumpDocument: 'Document',
  PaymentSettlement: 'Settlement',
  TankerDelivery: 'Delivery',
  NozzleCalibrationLog: 'Calibration',
  CreditClient: 'Credit client',
  PayrollRecord: 'Payroll record',
}

/** "Shift #123", "Expense #4": how an audit entry names its entity. */
export function auditEntityLabel(entityType: string, entityId: string): string {
  return `${ENTITY_LABELS[entityType] ?? entityType} #${entityId}`
}
