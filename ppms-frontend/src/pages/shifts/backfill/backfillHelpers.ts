import { localDateInputValue } from '../../../utils/date'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function maxDate(): string { return localDateInputValue(-1) }

export function minDate(): string { return localDateInputValue(-365) }

export function safeParse(v: string): number {
  const n = parseFloat(v)
  return isFinite(n) && n >= 0 ? n : 0
}

export function fmt(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Credit entry row state ────────────────────────────────────────────────────

export interface CreditRow {
  _key: number
  clientId: number | null
  clientName: string
  amount: string
  fuelType: string
  billNo: string
  description: string
}

export let _rowKey = 0

export function newCreditRow(): CreditRow {
  return { _key: ++_rowKey, clientId: null, clientName: '', amount: '', fuelType: '', billNo: '', description: '' }
}

// ── BackfillShiftModalProps ─────────────────────────────────────────────────────────────────────

export interface BackfillShiftModalProps {
  pumpId: number
  onClose: () => void
}
