

export function subtractOneMinute(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const totalMins = h * 60 + m - 1
  const adjusted = (totalMins + 1440) % 1440 // wrap around midnight
  const hh = String(Math.floor(adjusted / 60)).padStart(2, '0')
  const mm = String(adjusted % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export const TIME_OPTS = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? '00' : '30'
  const value = `${String(h).padStart(2, '0')}:${m}`
  const ampm = h < 12 ? 'AM' : 'PM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  const label = `${h12}:${m} ${ampm}`
  return { value, label }
})

export const SORT_ORDER_OPTS = [1, 2, 3, 4].map(n => ({ value: String(n), label: `#${n}` }))

export interface ShiftRow {
  name: string
  startTime: string
  endTime: string
  isNightShift: boolean
  sortOrder: number
}

export function defaultRows(): ShiftRow[] {
  return [{ name: '', startTime: '06:00', endTime: '14:00', isNightShift: false, sortOrder: 1 }]
}

export interface ShiftLength {
  hours: number
  minutes: number
  endsNextDay: boolean
}

/**
 * How long a shift row runs, from its start and (exclusive) end times. Only a night shift may run past midnight;
 * for any other row an end at or before the start is a mistake, so this returns null.
 */
export function shiftLength(row: Pick<ShiftRow, 'startTime' | 'endTime' | 'isNightShift'>): ShiftLength | null {
  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }
  const start = toMinutes(row.startTime)
  const end = toMinutes(row.endTime)
  const endsNextDay = end <= start
  if (endsNextDay && !row.isNightShift) return null
  const total = endsNextDay ? end + 1440 - start : end - start
  return { hours: Math.floor(total / 60), minutes: total % 60, endsNextDay }
}
