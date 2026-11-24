import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'

export interface ShiftSchedule {
  /** "effectiveFrom|effectiveTo", or "effectiveFrom|open" while it has no end date. */
  key: string
  effectiveFrom: string
  effectiveTo: string | null
  isActive: boolean
  definitions: ShiftDefinition[]
}

/**
 * Groups definitions into schedules by their date range: two schedules may start on the same day when a disabled
 * one and its replacement coexist. Newest start first; on the same start the open-ended one comes first.
 */
export function groupSchedules(definitions: ShiftDefinition[]): ShiftSchedule[] {
  const byKey = new Map<string, ShiftDefinition[]>()
  for (const definition of definitions) {
    const key = `${definition.effectiveFrom}|${definition.effectiveTo ?? 'open'}`
    byKey.set(key, [...(byKey.get(key) ?? []), definition])
  }
  return [...byKey.entries()]
    .map(([key, group]) => ({
      key,
      effectiveFrom: group[0].effectiveFrom,
      effectiveTo: group[0].effectiveTo,
      isActive: group.some((definition) => definition.effectiveTo === null),
      definitions: [...group].sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => {
      if (a.effectiveFrom !== b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom)
      if (a.effectiveTo === null) return -1
      if (b.effectiveTo === null) return 1
      return b.effectiveTo.localeCompare(a.effectiveTo)
    })
}
