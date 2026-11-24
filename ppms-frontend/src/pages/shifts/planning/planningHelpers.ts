import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { formatIstDate, formatIstDateTime } from '../../../utils/date'

// One accent stripe per shift row, cycled by position; the shift name and time identify the row, not the colour.
export const SHIFT_ROW_ACCENTS = [
  'ui-plan-accent--1',
  'ui-plan-accent--2',
  'ui-plan-accent--3',
  'ui-plan-accent--4',
]

export function formatDay(iso: string): string {
  return formatIstDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "HH:MM:SS" wall-clock time as "11:00 pm" in the active language. */
function formatShiftTime(time: string): string {
  return formatIstDateTime(new Date(`1970-01-01T${time}+05:30`), { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** "11:00 pm – 9:00 am"; the caller adds the next-day marker for shifts that cross midnight. */
export function formatShiftWindow(def: Pick<ShiftDefinition, 'startTime' | 'endTime'>): string {
  return `${formatShiftTime(def.startTime)} – ${formatShiftTime(def.endTime)}`
}
