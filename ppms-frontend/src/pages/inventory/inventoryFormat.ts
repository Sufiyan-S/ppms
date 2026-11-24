
// ── Colour helpers ─────────────────────────────────────────────────────────────

export { FUEL_STOCK_COLORS as FUEL_COLORS } from '../../constants/fuel'

export function limitDecimals(value: string, places: number): string {
  const dot = value.indexOf('.')
  if (dot === -1) return value
  return value.slice(0, dot + 1 + places)
}

export { formatLitres as fmtQty } from '../../utils/format'

export { formatIstDate as fmtDate } from '../../utils/date'
