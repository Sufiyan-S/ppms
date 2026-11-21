
// ── Date helpers ───────────────────────────────────────────────────────────────
// Use local calendar date (not UTC) so the value matches the user's timezone.


// ── Formatting helpers ──────────────────────────────────────────────────────────

export const IST_TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
})

export function fmtMoney(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtLitres(n: number) {
  return `${n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
}

export { formatIstDate as fmtDate } from '../../utils/date'

export { formatIstDateTime as fmtDateTime } from '../../utils/date'

export { FUEL_BADGE } from '../../constants/fuel'
