import { addDays, formatIstDate, istDateString } from '../../utils/date'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function getWeekKey(dateOrIso: string): string {
  const istDate = DATE_ONLY.test(dateOrIso) ? dateOrIso : istDateString(new Date(dateOrIso))
  const dayOfWeek = new Date(`${istDate}T00:00:00Z`).getUTCDay()
  const monday = addDays(istDate, dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
  const sunday = addDays(monday, 6)
  const fmt = (date: string) =>
    formatIstDate(date, { day: '2-digit', month: 'short', year: 'numeric' })
  return `${fmt(monday)} – ${fmt(sunday)}`
}

export function getMonthKey(dateOrIso: string): string {
  return formatIstDate(dateOrIso, { month: 'long', year: 'numeric' })
}

/** The calendar month before the current IST month, both dates inclusive (YYYY-MM-DD). */
export function lastCompletedMonth(today: string = istDateString()) {
  const periodTo = addDays(`${today.slice(0, 8)}01`, -1)
  return { periodFrom: `${periodTo.slice(0, 8)}01`, periodTo }
}
