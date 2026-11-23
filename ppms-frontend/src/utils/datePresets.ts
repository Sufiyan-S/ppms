import { addDays, istDateString, mondayOf } from './date'

export interface DateRange {
  from: string
  to: string
}

export type DatePresetId = 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'fyToDate'

/** Labels live in common.json under datePresets.<id>. */
export const DATE_PRESETS: { id: DatePresetId }[] = [
  { id: 'today' },
  { id: 'yesterday' },
  { id: 'thisWeek' },
  { id: 'thisMonth' },
  { id: 'lastMonth' },
  { id: 'fyToDate' },
]

function firstOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

/** The range a preset stands for, counted from today's IST date; weeks start on Monday and the Indian FY on 1 April. */
export function presetRange(id: DatePresetId, today: string = istDateString()): DateRange {
  switch (id) {
    case 'today':     return { from: today, to: today }
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'thisWeek':  return { from: mondayOf(today), to: today }
    case 'thisMonth': return { from: firstOfMonth(today), to: today }
    case 'lastMonth': {
      const lastDay = addDays(firstOfMonth(today), -1)
      return { from: firstOfMonth(lastDay), to: lastDay }
    }
    case 'fyToDate': {
      const year = Number(today.slice(0, 4))
      const fyStartYear = Number(today.slice(5, 7)) >= 4 ? year : year - 1
      return { from: `${fyStartYear}-04-01`, to: today }
    }
  }
}

export function matchingPreset(range: DateRange, today: string = istDateString()): DatePresetId | null {
  return DATE_PRESETS.find(({ id }) => {
    const preset = presetRange(id, today)
    return preset.from === range.from && preset.to === range.to
  })?.id ?? null
}

export function daysInRange(range: DateRange): number {
  const millisPerDay = 86_400_000
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / millisPerDay) + 1
}

/** The period of the same length that ends the day before the range starts. */
export function previousPeriod(range: DateRange): DateRange {
  const length = daysInRange(range)
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) }
}

export interface PeriodChange {
  direction: 'up' | 'down' | 'same'
  /** Percentage change from the previous period; null when the previous period was zero, so no percentage exists. */
  percent: number | null
}

export function periodChange(current: number, previous: number): PeriodChange {
  const difference = Math.round((current - previous) * 100) / 100
  const direction = difference > 0 ? 'up' : difference < 0 ? 'down' : 'same'
  if (previous === 0) return { direction, percent: direction === 'same' ? 0 : null }
  return { direction, percent: Math.round((difference / Math.abs(previous)) * 1000) / 10 }
}
