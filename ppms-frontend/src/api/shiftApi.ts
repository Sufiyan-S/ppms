import client from './client'
import type { SpringPage } from '../types/paged'
import type {
  Shift, OpenShiftRequest, CloseShiftRequest, CreditEntryInput, BackfillShiftRequest, CreateHandoverRequest, HandoverResponse,
} from '../types/shift'

export type { CreditEntryInput }

export interface ResolveDiscrepancyRequest {
  resolutionAction: 'PENDING_INVESTIGATION' | 'SALARY_DEDUCTION' | 'CASH_RECOVERY' | 'WAIVED'
  resolutionNote?: string
}

export interface ShiftHistoryFilter {
  from?: string
  to?: string
  discrepanciesOnly?: boolean
  discrepancyType?: 'SHORT' | 'OVER'
  /** Keeps shifts that sold this fuel; the server refuses it together with discrepanciesOnly. */
  fuelType?: string
}

const HISTORY_PAGE_SIZE = 200

// The server answers a resend carrying the same key with the first result instead of writing twice.
const withIdempotencyKey = (idempotencyKey?: string) =>
  idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined
const MAX_HISTORY_PAGES = 25

export const shiftApi = {
  getActiveShifts: (pumpId: number) =>
    client.get<Shift[]>(`/pumps/${pumpId}/shifts/active`).then((r) => r.data),

  getShiftHistoryPage: (pumpId: number, filter: ShiftHistoryFilter, page: number, size: number) =>
    client.get<SpringPage<Shift>>(`/pumps/${pumpId}/shifts/history`, {
      params: {
        page,
        size,
        ...(filter.from && { from: filter.from }),
        ...(filter.to && { to: filter.to }),
        ...(filter.discrepanciesOnly && { discrepanciesOnly: true }),
        ...(filter.discrepancyType && { discrepancyType: filter.discrepancyType }),
        ...(filter.fuelType && { fuelType: filter.fuelType }),
      },
    }).then((r) => r.data),

  // Loads every shift matching the filter; callers pass a filter that bounds the result (a date range or discrepancies only)
  getShiftHistory: async (pumpId: number, filter: ShiftHistoryFilter): Promise<Shift[]> => {
    const all: Shift[] = []
    for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
      const result = await shiftApi.getShiftHistoryPage(pumpId, filter, page, HISTORY_PAGE_SIZE)
      all.push(...result.content)
      if (result.content.length === 0 || page + 1 >= result.page.totalPages) break
    }
    return all
  },

  getShift: (pumpId: number, id: number) =>
    client.get<Shift>(`/pumps/${pumpId}/shifts/${id}`).then((r) => r.data),

  openShift: (pumpId: number, request: OpenShiftRequest) =>
    client.post<Shift>(`/pumps/${pumpId}/shifts/open`, request).then((r) => r.data),

  addCreditEntry: (pumpId: number, shiftId: number, entry: CreditEntryInput, idempotencyKey?: string) =>
    client.post<Shift>(`/pumps/${pumpId}/shifts/${shiftId}/credit-entries`, entry, withIdempotencyKey(idempotencyKey))
      .then((r) => r.data),

  closeShift: (pumpId: number, shiftId: number, request: CloseShiftRequest, idempotencyKey?: string) =>
    client.post<Shift>(`/pumps/${pumpId}/shifts/${shiftId}/close`, request, withIdempotencyKey(idempotencyKey))
      .then((r) => r.data),

  createHandover: (pumpId: number, request: CreateHandoverRequest, idempotencyKey?: string) =>
    client.post<HandoverResponse>(`/pumps/${pumpId}/handovers`, request, withIdempotencyKey(idempotencyKey))
      .then((r) => r.data),

  resolveDiscrepancy: (pumpId: number, shiftId: number, req: ResolveDiscrepancyRequest) =>
    client.patch<Shift>(`/pumps/${pumpId}/shifts/${shiftId}/discrepancy-resolution`, req).then((r) => r.data),

  voidCreditEntry: (pumpId: number, shiftId: number, entryId: number, voidReason: string) =>
    client.patch<Shift>(`/pumps/${pumpId}/shifts/${shiftId}/credit-entries/${entryId}/void`, { voidReason }).then((r) => r.data),

  backfillShift: (pumpId: number, request: BackfillShiftRequest) =>
    client.post<Shift>(`/pumps/${pumpId}/shifts/backfill`, request).then((r) => r.data),
}
