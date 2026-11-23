import client from './client'
import type { PagedResponse } from '../types/paged'

// ── Types ──────────────────────────────────────────────────────────────────

export type SettlementPaymentType = 'UPI' | 'CARD' | 'FLEET_CARD'

export interface Settlement {
  id: number
  pumpId: number
  paymentType: SettlementPaymentType
  settlementDate: string   // YYYY-MM-DD
  amountReceived: number
  notes: string | null
  bankReference: string | null
  recordedByUserName: string
  createdAt: string
  /** Wallet balance at the time of recording. Null for legacy entries. */
  pendingAtRecordTime: number | null
  /** True when amountReceived < pendingAtRecordTime (partial settlement). */
  isPartial: boolean
  /** VOIDED settlements are listed for the record but no longer count towards settled amounts. */
  voidStatus: 'ACTIVE' | 'VOIDED'
  voidReason: string | null
  voidedAt: string | null
}

export interface SettlementConfig {
  id: number | null
  paymentType: SettlementPaymentType
  alertTime: string        // HH:mm
  enabled: boolean
}

export interface WalletSummary {
  upiPending: number
  cardPending: number
  fleetCardPending: number
  totalPending: number
}

export interface RecordSettlementRequest {
  paymentType: SettlementPaymentType
  settlementDate: string   // YYYY-MM-DD
  amountReceived: number
  notes?: string
  bankReference?: string
}

export interface UpdateConfigRequest {
  alertTime: string        // HH:mm
  enabled: boolean
}

/** Consecutive collection days of one type whose money has not reached the bank; overdue once past T+2. */
export interface PendingSettlementRange {
  paymentType: SettlementPaymentType
  fromDate: string
  toDate: string
  amount: number
  ageDays: number
  overdue: boolean
  days: { date: string; amount: number }[]
}

export interface DailySummaryEntry {
  date: string                  // YYYY-MM-DD
  upiCollected: number          // from closed shifts
  cardCollected: number
  fleetCardCollected: number
  upiSettled: number            // from recorded settlements
  cardSettled: number
  fleetCardSettled: number
  settlements: Settlement[]     // individual records for this date
}

// ── API ──────────────────────────────────────────────────────────────────

export const paymentSettlementApi = {
  /** Paginated list of settlement records for a pump, newest first. Optionally filter by paymentType. */
  list: (pumpId: number, page = 0, size = 20, paymentType?: SettlementPaymentType): Promise<PagedResponse<Settlement>> => {
    const params: Record<string, string | number> = { page, size }
    if (paymentType) params.paymentType = paymentType
    return client.get(`/pumps/${pumpId}/settlements`, { params }).then(r => r.data)
  },

  /** Record a new settlement (amount received in bank). */
  record: (pumpId: number, data: RecordSettlementRequest): Promise<Settlement> =>
    client.post(`/pumps/${pumpId}/settlements`, data).then(r => r.data),

  /** Void a recorded settlement (Owner/Admin). The reason is required and kept on the record. */
  voidSettlement: (pumpId: number, settlementId: number, reason: string): Promise<Settlement> =>
    client.post(`/pumps/${pumpId}/settlements/${settlementId}/void`, { reason }).then(r => r.data),

  /** Current wallet balance per payment type. */
  getWallet: (pumpId: number): Promise<WalletSummary> =>
    client.get(`/pumps/${pumpId}/settlements/wallet`).then(r => r.data),

  /** Alert configs for all three payment types. */
  getConfigs: (pumpId: number): Promise<SettlementConfig[]> =>
    client.get(`/pumps/${pumpId}/settlement-configs`).then(r => r.data),

  /** Create or update alert config for one payment type. */
  upsertConfig: (pumpId: number, paymentType: SettlementPaymentType, data: UpdateConfigRequest): Promise<SettlementConfig> =>
    client.put(`/pumps/${pumpId}/settlement-configs/${paymentType}`, data).then(r => r.data),

  /** Unsettled collections as runs of consecutive days per payment type, oldest first. */
  getPendingByAge: (pumpId: number): Promise<PendingSettlementRange[]> =>
    client.get(`/pumps/${pumpId}/settlements/pending-by-age`).then(r => r.data),

  /** Per-date summary combining shift collections and recorded settlements, newest first. */
  getDailySummary: (pumpId: number, from: string, to: string, page = 0, size = 10): Promise<PagedResponse<DailySummaryEntry>> =>
    client.get(`/pumps/${pumpId}/settlements/daily-summary`, { params: { from, to, page, size } }).then(r => r.data),
}
