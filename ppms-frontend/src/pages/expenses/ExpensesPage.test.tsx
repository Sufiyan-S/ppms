import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expenseApi } from '../../api/expenseApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import ExpensesPage from './ExpensesPage'

vi.mock('../../api/expenseApi', () => ({
  expenseApi: { getSummary: vi.fn(), getExpenses: vi.fn(), createExpense: vi.fn() },
}))

describe('ExpensesPage without a pump', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Op', role: 'OPERATOR', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: null })
  })

  it('asks for a pump instead of showing a form that would post to no pump', () => {
    renderWithProviders(<ExpensesPage />)
    expect(screen.getByRole('status')).toHaveTextContent('No pump selected')
    expect(screen.queryByRole('button', { name: /add expense|save|record/i })).not.toBeInTheDocument()
    expect(expenseApi.createExpense).not.toHaveBeenCalled()
  })
})
