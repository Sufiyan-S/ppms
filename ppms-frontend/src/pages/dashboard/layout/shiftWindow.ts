import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { IST_TIME_ZONE } from '../../../i18n/format'

const MINUTE_MS = 60_000
const MINUTES_PER_DAY = 24 * 60

const IST_CLOCK_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

export interface CurrentShiftWindow {
  definition: ShiftDefinition
  start: Date
  end: Date
  /** Share of the window already gone, from 0 to 1. */
  elapsedFraction: number
  remainingMs: number
}

/** Minutes since IST midnight, with seconds as a fraction, whatever the device's time zone is. */
export function istMinutesOfDay(now: Date): number {
  const parts = IST_CLOCK_FORMAT.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return part('hour') * 60 + part('minute') + part('second') / 60
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Share of the IST business day (midnight to midnight) already gone, from 0 to 1. */
export function dayProgressFraction(now: Date): number {
  return istMinutesOfDay(now) / MINUTES_PER_DAY
}

/**
 * The shift window the pump is in right now, or null between windows.
 * Stored end times are one minute short of the shown end (08:59 means the shift ends at 09:00).
 */
export function findCurrentShiftWindow(definitions: ShiftDefinition[], now: Date): CurrentShiftWindow | null {
  const nowMinutes = istMinutesOfDay(now)

  for (const definition of definitions) {
    const startMinutes = minutesOf(definition.startTime)
    const endMinutes = minutesOf(definition.endTime) + 1
    const lengthMinutes = (endMinutes - startMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY || MINUTES_PER_DAY
    const elapsedMinutes = (nowMinutes - startMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY
    if (elapsedMinutes >= lengthMinutes) continue

    const start = new Date(now.getTime() - elapsedMinutes * MINUTE_MS)
    const end = new Date(start.getTime() + lengthMinutes * MINUTE_MS)
    return {
      definition,
      start,
      end,
      elapsedFraction: elapsedMinutes / lengthMinutes,
      remainingMs: end.getTime() - now.getTime(),
    }
  }
  return null
}

/** Whole hours and minutes left, rounding minutes up so a shift never reads "ends in 0m" while it is still open. */
export function splitRemaining(remainingMs: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / MINUTE_MS))
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}
