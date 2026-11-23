import client from './client'

export type ApprovalKind = 'EXPENSE' | 'CREDIT_PAYMENT'

export interface ApprovalItem {
  kind: ApprovalKind
  id: number
  amount: number
  /** Expense date, or the date a credit payment was received (YYYY-MM-DD). */
  itemDate: string
  submittedByName: string | null
  submittedAt: string | null
  /** Expense category; null for a credit payment. */
  category: string | null
  clientId: number | null
  clientName: string | null
  note: string | null
  /** Why the current user cannot decide this item; null when they can. */
  blockedReason: string | null
  blockedReasonCode: string | null
  blockedReasonParams: Record<string, unknown>
}

export interface ApprovalItemKey {
  kind: ApprovalKind
  id: number
}

export interface ApprovalDecisionResult {
  succeeded: number
  failed: number
  results: Array<ApprovalItemKey & { succeeded: boolean; message: string | null; code: string | null; params: Record<string, unknown> | null }>
}

export const approvalApi = {
  getPending: (pumpId: number) =>
    client.get<ApprovalItem[]>(`/pumps/${pumpId}/approvals`).then(r => r.data),

  decide: (pumpId: number, items: ApprovalItemKey[], action: 'APPROVED' | 'REJECTED', reason?: string) =>
    client.post<ApprovalDecisionResult>(`/pumps/${pumpId}/approvals/decisions`, { items, action, reason })
      .then(r => r.data),
}
