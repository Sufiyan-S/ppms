import client from './client'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ShiftDefinition {
  id: number
  pumpId: number
  name: string
  startTime: string   // "HH:MM:SS" from LocalTime
  endTime: string     // "HH:MM:SS" from LocalTime
  crossesMidnight: boolean
  isNightShift: boolean
  sortOrder: number
  effectiveFrom: string   // "YYYY-MM-DD"
  effectiveTo: string | null
  windowLabel: string     // e.g. "10:00 PM – 10:00 AM (+1)"
}

export interface CreateShiftDefinitionRequest {
  name: string
  startTime: string   // "HH:MM"
  endTime: string     // "HH:MM"
  isNightShift: boolean
  sortOrder: number
  effectiveFrom: string         // "YYYY-MM-DD"
  effectiveTo?: string | null   // "YYYY-MM-DD" or null = open-ended
}

// ── API ────────────────────────────────────────────────────────────────────────

export const shiftDefinitionApi = {
  /** All definitions for a pump (all effective-date groups, newest first) */
  getAll: (pumpId: number) =>
    client.get<ShiftDefinition[]>(`/pumps/${pumpId}/shift-definitions`).then(r => r.data),

  /** Only currently active definitions for a pump (today's date) */
  getActive: (pumpId: number) =>
    client.get<ShiftDefinition[]>(`/pumps/${pumpId}/shift-definitions/active`).then(r => r.data),

  /**
   * Creates a new batch of shift definitions for a pump.
   * All entries in the batch share the same effectiveFrom date.
   * Previous open definitions are automatically closed.
   */
  createBatch: (pumpId: number, requests: CreateShiftDefinitionRequest[]) =>
    client.post<ShiftDefinition[]>(`/pumps/${pumpId}/shift-definitions`, requests).then(r => r.data),

  /**
   * Deletes a specific group of definitions for a pump.
   * effectiveTo = null → delete the open-ended (active) group.
   * effectiveTo = date string → delete that specific disabled group.
   */
  deleteGroup: (pumpId: number, effectiveFrom: string, effectiveTo: string | null) => {
    const params: Record<string, string> = { effectiveFrom }
    if (effectiveTo !== null) params.effectiveTo = effectiveTo
    return client.delete(`/pumps/${pumpId}/shift-definitions`, { params }).then(r => r.data)
  },

  /**
   * Disables a shift group by setting effectiveTo = disableDate.
   * Operators cannot open new shifts after disableDate under this schedule.
   */
  disableGroup: (pumpId: number, effectiveFrom: string, disableDate: string) =>
    client.patch<ShiftDefinition[]>(
      `/pumps/${pumpId}/shift-definitions/disable`,
      { disableDate },
      { params: { effectiveFrom } }
    ).then(r => r.data),

  /**
   * Returns the shift definitions that were active for a pump on a given historical date.
   * Used by the backfill modal to populate the shift window selector.
   */
  getForDate: (pumpId: number, date: string) =>
    client.get<ShiftDefinition[]>(`/pumps/${pumpId}/shift-definitions/for-date`, { params: { date } }).then(r => r.data),
}
