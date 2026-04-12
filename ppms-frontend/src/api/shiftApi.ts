import client from './client'
import type { DUOption, Shift, OpenShiftRequest, CloseShiftRequest, CreditEntryInput } from '../types/shift'

export type { CreditEntryInput }

export interface ResolveDiscrepancyRequest {
  resolutionAction: 'PENDING_INVESTIGATION' | 'SALARY_DEDUCTION' | 'CASH_RECOVERY' | 'WAIVED'
  resolutionNote?: string
}

export const shiftApi = {
  getActiveShifts: (pumpId: number) =>
    client.get<Shift[]>(`/pumps/${pumpId}/shifts/active`).then((r) => r.data),

  // Backend returns a Spring Page — extract the content array
  getShiftHistory: (pumpId: number) =>
    client.get<{ content: Shift[] }>(`/pumps/${pumpId}/shifts/history`).then((r) => r.data.content),

  getShift: (pumpId: number, id: number) =>
    client.get<Shift>(`/pumps/${pumpId}/shifts/${id}`).then((r) => r.data),

  openShift: (pumpId: number, request: OpenShiftRequest) =>
    client.post<Shift>(`/pumps/${pumpId}/shifts/open`, request).then((r) => r.data),

  addCreditEntry: (pumpId: number, shiftId: number, entry: CreditEntryInput) =>
    client.post<Shift>(`/pumps/${pumpId}/shifts/${shiftId}/credit-entries`, entry).then((r) => r.data),

  closeShift: (pumpId: number, shiftId: number, request: CloseShiftRequest) =>
    client.post<Shift>(`/pumps/${pumpId}/shifts/${shiftId}/close`, request).then((r) => r.data),

  getDUs: (pumpId: number) =>
    client.get<DUOption[]>(`/pumps/${pumpId}/dus`).then((r) => r.data),

  resolveDiscrepancy: (pumpId: number, shiftId: number, req: ResolveDiscrepancyRequest) =>
    client.patch<Shift>(`/pumps/${pumpId}/shifts/${shiftId}/discrepancy-resolution`, req).then((r) => r.data),

  voidCreditEntry: (pumpId: number, shiftId: number, entryId: number, voidReason: string) =>
    client.patch<Shift>(`/pumps/${pumpId}/shifts/${shiftId}/credit-entries/${entryId}/void`, null, { params: { voidReason } }).then((r) => r.data),
}
