import client from './client'
import type { PagedResponse } from '../types/paged'

export type ExpenseCategory = 'FUEL' | 'MAINTENANCE' | 'SALARY' | 'UTILITIES' | 'EQUIPMENT' | 'OTHER'
export type ExpenseApprovalStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'

export interface PumpExpense {
  id: number
  pumpId: number
  category: ExpenseCategory
  amount: number
  description: string
  expenseDate: string
  recordedByUserId: number
  approvalStatus: ExpenseApprovalStatus
  approvedByUserId: number | null
  approvedAt: string | null
  approvalNotes: string | null
  submittedByUserId: number | null
  submittedAt: string | null
  createdAt: string
}

export interface CreateExpenseRequest {
  category: ExpenseCategory
  amount: number
  description: string
  expenseDate: string
  saveDraft?: boolean
}

export interface ApproveExpenseRequest {
  action: 'APPROVED' | 'REJECTED'
  notes?: string
}

export interface ExpenseSummary {
  approvedTotal: number
  pendingCount: number
  pendingTotal: number
}

export const expenseApi = {
  getSummary: (pumpId: number): Promise<ExpenseSummary> =>
    client.get(`/pumps/${pumpId}/expenses/summary`).then(r => r.data),

  getExpenses: (
    pumpId: number,
    page = 0,
    size = 10,
    category?: ExpenseCategory,
    approvalStatus?: ExpenseApprovalStatus,
  ): Promise<PagedResponse<PumpExpense>> =>
    client.get(`/pumps/${pumpId}/expenses`, {
      params: { page, size, ...(category && { category }), ...(approvalStatus && { approvalStatus }) },
    }).then(r => r.data),

  createExpense: (pumpId: number, data: CreateExpenseRequest): Promise<PumpExpense> =>
    client.post(`/pumps/${pumpId}/expenses`, data).then(r => r.data),

  approveExpense: (pumpId: number, expenseId: number, data: ApproveExpenseRequest): Promise<PumpExpense> =>
    client.patch(`/pumps/${pumpId}/expenses/${expenseId}/approve`, data).then(r => r.data),

  submitExpense: (pumpId: number, expenseId: number): Promise<PumpExpense> =>
    client.patch(`/pumps/${pumpId}/expenses/${expenseId}/submit`).then(r => r.data),

  deleteExpense: (pumpId: number, expenseId: number): Promise<void> =>
    client.delete(`/pumps/${pumpId}/expenses/${expenseId}`).then(r => r.data),
}
