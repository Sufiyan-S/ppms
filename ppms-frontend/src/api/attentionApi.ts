import client from './client'

export type AttentionType =
  | 'PENDING_APPROVALS'
  | 'ESCALATED_SHORTAGES'
  | 'LONG_INVESTIGATIONS'
  | 'OVERDUE_CREDIT'
  | 'OVER_LIMIT_CREDIT'
  | 'UNSETTLED_PAYMENTS'
  | 'BALANCE_SHEETS'
  | 'OVERDUE_SHIFTS'
  | 'AUTO_CLOSED_SHIFTS'
  | 'EXPIRING_DOCUMENTS'
  | 'CALIBRATIONS_DUE'
  | 'STALE_FUEL_PRICES'
  | 'SETUP_INCOMPLETE'

/** Most urgent first; the server already returns items in this order. */
export type AttentionSeverity = 'HIGH' | 'MEDIUM' | 'LOW'

export interface AttentionItem {
  type: AttentionType
  severity: AttentionSeverity
  pumpId: number
  pumpName: string
  count: number
  /** Money involved; null when the item is not about money. */
  amount: number | null
  reason: string
  reasonCode: string
  reasonParams: Record<string, unknown>
  /** Page that handles the item, with the filters that show exactly these records. */
  targetPath: string
}

export const attentionApi = {
  getForPump: (pumpId: number) =>
    client.get<AttentionItem[]>(`/pumps/${pumpId}/attention`).then(r => r.data),

  getForMyPumps: () =>
    client.get<AttentionItem[]>('/pumps/attention').then(r => r.data),
}
