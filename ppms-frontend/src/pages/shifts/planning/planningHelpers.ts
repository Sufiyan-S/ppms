import { formatIstDate } from '../../../utils/date'

// Cyclic color palette for shift rows — index into this by (sortOrder - 1)
export const SHIFT_ROW_COLORS = [
  { bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  { bg: 'bg-amber-50',   text: 'text-amber-700'  },
  { bg: 'bg-emerald-50', text: 'text-emerald-700'},
  { bg: 'bg-rose-50',    text: 'text-rose-700'   },
]

export const STATUS_BADGE: Record<string, string> = {
  PLANNED:   'bg-slate-100 text-slate-600',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  ABSENT:    'bg-red-100 text-red-600',
}

export function formatDay(iso: string): string {
  return formatIstDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })
}
