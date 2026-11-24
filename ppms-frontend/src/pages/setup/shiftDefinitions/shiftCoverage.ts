import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'

const DAY_MINUTES = 1440

/** A stretch of the day in minutes from midnight; end is exclusive, so 06:00–14:00 is [360, 840). A gap or overlap past midnight has its end before its start. */
export interface MinuteRange {
  start: number
  end: number
}

export interface TimelineShift {
  id: number
  name: string
  sortOrder: number
  /** e.g. "6:00 AM – 2:00 PM", the shift's own label for the whole window. */
  windowLabel: string
}

export interface TimelineSegment extends MinuteRange {
  shift: TimelineShift
  /** Lane 0 is the top row; a shift that overlaps an earlier one drops to the next lane. */
  lane: number
}

export interface Overlap extends MinuteRange {
  names: string[]
}

export interface TimelineCoverage {
  segments: TimelineSegment[]
  laneCount: number
  gaps: MinuteRange[]
  overlaps: Overlap[]
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * The shift's pieces of the day. Stored end times are the last minute worked (the end the owner typed, less a
 * minute), so a minute is added back; a shift past midnight is split into an evening piece and a morning piece.
 */
export function shiftRanges(definition: Pick<ShiftDefinition, 'startTime' | 'endTime'>): MinuteRange[] {
  const start = toMinutes(definition.startTime)
  const end = toMinutes(definition.endTime) + 1
  if (end > start) return [{ start, end }]
  return [{ start, end: DAY_MINUTES }, ...(end > 0 ? [{ start: 0, end }] : [])]
}

/** Where the coverage count over the day stays the same, as runs of minutes. */
function runsWhere(shiftsAtMinute: TimelineShift[][], keep: (shifts: TimelineShift[]) => boolean): Overlap[] {
  const runs: Overlap[] = []
  for (let minute = 0; minute < DAY_MINUTES; minute++) {
    const shifts = shiftsAtMinute[minute]
    if (!keep(shifts)) continue
    const names = shifts.map((shift) => shift.name)
    const last = runs[runs.length - 1]
    if (last && last.end === minute && last.names.join() === names.join()) last.end = minute + 1
    else runs.push({ start: minute, end: minute + 1, names })
  }
  return runs
}

/** A run that ends at midnight and one that starts there are the same stretch of time, so they become one range whose end is before its start. */
function joinAcrossMidnight(runs: Overlap[]): Overlap[] {
  const first = runs[0]
  const last = runs[runs.length - 1]
  if (runs.length < 2 || first.start !== 0 || last.end !== DAY_MINUTES || first.names.join() !== last.names.join()) return runs
  return [...runs.slice(1, -1), { start: last.start, end: first.end, names: last.names }]
}

/** Lays a schedule's shifts on a 24-hour bar and finds the hours no shift covers and the hours two shifts share. */
export function timelineCoverage(definitions: ShiftDefinition[]): TimelineCoverage {
  const pieces = definitions
    .flatMap((definition) => shiftRanges(definition).map((range) => ({
      ...range,
      shift: { id: definition.id, name: definition.name, sortOrder: definition.sortOrder, windowLabel: definition.windowLabel },
    })))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const laneEnds: number[] = []
  const segments = pieces.map((piece) => {
    const free = laneEnds.findIndex((laneEnd) => laneEnd <= piece.start)
    const lane = free === -1 ? laneEnds.length : free
    laneEnds[lane] = piece.end
    return { ...piece, lane }
  })

  const shiftsAtMinute = Array.from({ length: DAY_MINUTES }, () => [] as TimelineShift[])
  for (const segment of segments) {
    for (let minute = segment.start; minute < segment.end; minute++) shiftsAtMinute[minute].push(segment.shift)
  }

  return {
    segments,
    laneCount: Math.max(laneEnds.length, 1),
    gaps: definitions.length === 0 ? [] : joinAcrossMidnight(runsWhere(shiftsAtMinute, (shifts) => shifts.length === 0))
      .map(({ start, end }) => ({ start, end })),
    overlaps: joinAcrossMidnight(runsWhere(shiftsAtMinute, (shifts) => shifts.length > 1)),
  }
}

/** "6:00 AM"; the end of the day reads as midnight, "12:00 AM". */
export function formatClock(minutes: number): string {
  const wrapped = minutes % DAY_MINUTES
  const hours = Math.floor(wrapped / 60)
  const mins = String(wrapped % 60).padStart(2, '0')
  const hours12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hours12}:${mins} ${hours < 12 ? 'AM' : 'PM'}`
}

export function percentOfDay(minutes: number): number {
  return (minutes / DAY_MINUTES) * 100
}
