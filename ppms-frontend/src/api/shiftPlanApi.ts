import client from './client'

export type PreferredDayOff = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
export type ShiftPlanStatus = 'DRAFT' | 'PUBLISHED'
export type ShiftPlanEntryStatus = 'PLANNED' | 'CONFIRMED' | 'ABSENT'

export const DAY_LABELS: Record<PreferredDayOff, string> = {
  MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday',
}

export interface StaffPreference {
  id?: number
  userId: number
  pumpId: number
  preferredShiftDefinitionId: number | null
  preferredDayOff: PreferredDayOff | null
}

export interface StaffLeave {
  id: number
  userId: number
  pumpId: number
  leaveDate: string   // ISO date
  reason: string | null
  createdAt: string
}

export interface ShiftPlan {
  id: number
  pumpId: number
  weekStart: string   // ISO date (Monday)
  status: ShiftPlanStatus
  operatorsPerDayShift: number
  operatorsPerNightShift: number
  createdByUserId: number | null
  createdAt: string
  updatedAt: string
}

export interface ShiftPlanEntry {
  id: number
  shiftPlanId: number
  shiftDate: string   // ISO date
  shiftDefinitionId: number
  operatorUserId: number
  status: ShiftPlanEntryStatus
  note: string | null
  createdAt: string
}

/** One operator's actual attendance for a (date, shiftDefinitionId) slot — sourced from real Shift records. */
export interface ActualSlotEntry {
  shiftDate: string     // ISO date
  shiftDefinitionId: number
  operatorUserId: number
}

export const shiftPlanApi = {

  // ── Preferences ─────────────────────────────────────────────────────────────

  setPreference: (pumpId: number, userId: number, preferredShiftDefinitionId: number | null, preferredDayOff: PreferredDayOff | null) =>
    client.put<StaffPreference>(`/pumps/${pumpId}/staff/${userId}/preferences`, { preferredShiftDefinitionId, preferredDayOff }).then(r => r.data),

  getPreference: (pumpId: number, userId: number) =>
    client.get<StaffPreference>(`/pumps/${pumpId}/staff/${userId}/preferences`).then(r => r.data),

  // ── Leave ────────────────────────────────────────────────────────────────────

  addLeave: (pumpId: number, userId: number, leaveDate: string, reason?: string) =>
    client.post<StaffLeave>(`/pumps/${pumpId}/staff/${userId}/leaves`, { leaveDate, reason }).then(r => r.data),

  removeLeave: (pumpId: number, userId: number, leaveId: number) =>
    client.delete(`/pumps/${pumpId}/staff/${userId}/leaves/${leaveId}`),

  getLeaves: (pumpId: number, userId: number) =>
    client.get<StaffLeave[]>(`/pumps/${pumpId}/staff/${userId}/leaves`).then(r => r.data),

  // ── Plans ────────────────────────────────────────────────────────────────────

  generatePlan: (pumpId: number, weekStart: string, operatorsPerDayShift: number, operatorsPerNightShift: number) =>
    client.post<ShiftPlan>(`/pumps/${pumpId}/shift-plans/generate`, { weekStart, operatorsPerDayShift, operatorsPerNightShift }).then(r => r.data),

  getPlan: (pumpId: number, weekStart: string) =>
    client.get<ShiftPlan>(`/pumps/${pumpId}/shift-plans`, { params: { weekStart } }).then(r => r.data),

  getEntries: (pumpId: number, planId: number) =>
    client.get<ShiftPlanEntry[]>(`/pumps/${pumpId}/shift-plans/${planId}/entries`).then(r => r.data),

  addEntry: (pumpId: number, planId: number, shiftDate: string, shiftDefinitionId: number, operatorUserId: number, note?: string) =>
    client.post<ShiftPlanEntry>(`/pumps/${pumpId}/shift-plans/${planId}/entries`, { shiftDate, shiftDefinitionId, operatorUserId, note }).then(r => r.data),

  updateEntry: (pumpId: number, planId: number, entryId: number, operatorUserId: number, note?: string) =>
    client.patch<ShiftPlanEntry>(`/pumps/${pumpId}/shift-plans/${planId}/entries/${entryId}`, { operatorUserId, note }).then(r => r.data),

  removeEntry: (pumpId: number, planId: number, entryId: number) =>
    client.delete(`/pumps/${pumpId}/shift-plans/${planId}/entries/${entryId}`),

  publishPlan: (pumpId: number, planId: number) =>
    client.post<ShiftPlan>(`/pumps/${pumpId}/shift-plans/${planId}/publish`).then(r => r.data),

  getPlannedOperators: (pumpId: number, date: string, shiftDefinitionId: number) =>
    client.get<ShiftPlanEntry[]>(`/pumps/${pumpId}/shift-plans/planned-operators`, { params: { date, shiftDefinitionId } }).then(r => r.data),

  mySchedule: (pumpId: number) =>
    client.get<ShiftPlanEntry[]>(`/pumps/${pumpId}/shift-plans/my-schedule`).then(r => r.data),

  /** Actual operator attendance for past dates — derived from real Shift records (not plan entries). */
  getActualAttendance: (pumpId: number, from: string, to: string) =>
    client.get<ActualSlotEntry[]>(`/pumps/${pumpId}/shift-plans/actual-attendance`, { params: { from, to } }).then(r => r.data),
}
