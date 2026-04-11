import client from './client'
import type { PagedResponse } from '../types/paged'

export type CashEventType = 'OPENING_BALANCE' | 'CASH_IN' | 'CASH_OUT' | 'CLOSING_BALANCE'

export interface CashEvent {
  id: number
  pumpId: number
  eventType: CashEventType
  amount: number
  description: string
  eventDate: string
  recordedByUserId: number
  createdAt: string
}

export interface CashDrawerResponse {
  events: PagedResponse<CashEvent>
  currentBalance: number
}

export interface RecordCashEventRequest {
  eventType: CashEventType
  amount: number
  description: string
  eventDate: string
}

export const cashApi = {
  getCashEvents: (
    pumpId: number,
    page = 0,
    size = 10,
    eventType?: CashEventType,
  ): Promise<CashDrawerResponse> =>
    client.get(`/pumps/${pumpId}/cash-events`, {
      params: { page, size, ...(eventType && { eventType }) },
    }).then(r => r.data),

  recordCashEvent: (pumpId: number, data: RecordCashEventRequest): Promise<CashEvent> =>
    client.post(`/pumps/${pumpId}/cash-events`, data).then(r => r.data),
}
