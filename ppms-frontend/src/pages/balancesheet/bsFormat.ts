import type { ReactNode } from 'react'
import type { DataTableColumn } from '../../components/DataTable'
import { formatDateTimeIn } from '../../i18n/format'
import { formatLitres } from '../../utils/format'

// ── Date helpers ───────────────────────────────────────────────────────────────
// Use local calendar date (not UTC) so the value matches the user's timezone.


// ── Formatting helpers ──────────────────────────────────────────────────────────

export function fmtIstTime(iso: string) {
  return formatDateTimeIn(new Date(iso), { hour: '2-digit', minute: '2-digit' })
}

export function fmtLitres(n: number) {
  return formatLitres(n, 1)
}

export { formatIstDate as fmtDate } from '../../utils/date'

export { formatIstDateTime as fmtDateTime } from '../../utils/date'

export { FUEL_BADGE } from '../../constants/fuel'

/** A compact column for the balance sheet tables, whose rows are drawn with Td. */
export function bsColumn<Row>(key: string, header: ReactNode, numeric = false): DataTableColumn<Row> {
  return { key, header, numeric, className: 'px-2 py-2 print:px-1 print:py-1 text-xs whitespace-nowrap' }
}
