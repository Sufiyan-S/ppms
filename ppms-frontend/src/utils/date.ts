import { IST_TIME_ZONE, formatDateTimeIn } from '../i18n/format'

const IST_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The IST calendar date (YYYY-MM-DD) of the given instant, whatever the device's time zone is. */
export function istDateString(value: Date = new Date()): string {
  return IST_DATE_FORMAT.format(value)
}

/** Shifts a YYYY-MM-DD date by whole days. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Today's IST date (offset by whole days) in the YYYY-MM-DD form date inputs expect. */
export function localDateInputValue(offsetDays = 0): string {
  return addDays(istDateString(), offsetDays)
}

/** Monday (YYYY-MM-DD) of the week that contains the given YYYY-MM-DD date. */
export function mondayOf(isoDate: string): string {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  return addDays(isoDate, weekday === 0 ? -6 : 1 - weekday)
}

export function formatIstDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  const date = value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00+05:30`)
      : new Date(value)

  return formatDateTimeIn(date, options)
}

export function formatIstDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
): string {
  const date = value instanceof Date ? value : new Date(value)
  return formatDateTimeIn(date, options)
}

/** Rewrites machine dates (YYYY-MM-DD) inside server-written text as readable dates, e.g. "30 Nov 2026". */
export function withReadableDates(text: string): string {
  return text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (isoDate) => formatIstDate(isoDate))
}
