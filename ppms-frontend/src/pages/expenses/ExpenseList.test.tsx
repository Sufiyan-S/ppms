import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expenseApi } from '../../api/expenseApi'
import type { PumpExpense } from '../../api/expenseApi'
import { useAuthStore } from '../../store/authStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ExpenseList } from './ExpenseList'
import type { ExpenseListState } from './useExpenseList'

vi.mock('../../api/expenseApi', () => ({ expenseApi: { approveExpense: vi.fn() } }))

const pending = {
  id: 7, pumpId: 3, category: 'MAINTENANCE', amount: 1200, description: 'Compressor repair', expenseDate: '2026-11-20',
  recordedByUserId: 9, approvalStatus: 'PENDING_APPROVAL', approvedByUserId: null, approvedAt: null, approvalNotes: null,
  submittedByUserId: 9, submittedAt: '2026-11-20T10:00:00Z', createdAt: '2026-11-20T10:00:00Z',
} as PumpExpense

const list = {
  expenses: [pending], expensesPage: undefined, isLoading: false,
  categoryFilter: '', setCategoryFilter: vi.fn(), statusFilter: '', setStatusFilter: vi.fn(),
  setPage: vi.fn(), setPageSize: vi.fn(),
} as unknown as ExpenseListState

describe('ExpenseList rejection', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    vi.mocked(expenseApi.approveExpense).mockReset().mockResolvedValue({ ...pending, approvalStatus: 'REJECTED' })
  })

  it('asks for a reason before rejecting and sends it as the rejection note', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExpenseList pumpId={3} list={list} />)

    await user.click(screen.getByRole('button', { name: 'Reject' }))
    const dialog = screen.getByRole('dialog', { name: 'Reject Expense' })
    expect(expenseApi.approveExpense).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a reason for rejecting.')
    expect(expenseApi.approveExpense).not.toHaveBeenCalled()

    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Duplicate bill')
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(expenseApi.approveExpense).toHaveBeenCalledWith(3, 7, { action: 'REJECTED', notes: 'Duplicate bill' })
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('still approves with one click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExpenseList pumpId={3} list={list} />)

    await user.click(screen.getByRole('button', { name: 'Approve' }))

    expect(expenseApi.approveExpense).toHaveBeenCalledWith(3, 7, { action: 'APPROVED' })
  })
})
