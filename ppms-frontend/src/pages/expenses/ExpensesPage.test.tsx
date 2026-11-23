import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expenseApi } from '../../api/expenseApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import ExpensesPage from './ExpensesPage'

vi.mock('../../api/expenseApi', () => ({
  expenseApi: { getSummary: vi.fn(), getExpenses: vi.fn(), createExpense: vi.fn() },
}))

function CurrentSearch() {
  return <output aria-label="Address">{useLocation().search}</output>
}

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

describe('ExpensesPage entry from the address', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Manager', role: 'MANAGER', assignedPumpId: 3 }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 3 })
    vi.mocked(expenseApi.getSummary).mockResolvedValue({ approvedTotal: 0, pendingCount: 2, pendingTotal: 900 })
    vi.mocked(expenseApi.getExpenses).mockResolvedValue({
      content: [], page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false,
    })
    vi.mocked(expenseApi.createExpense).mockResolvedValue({} as never)
  })

  it('opens the expense form from ?action=add-expense, reviews it and saves it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<><ExpensesPage /><CurrentSearch /></>, { route: '/dashboard/expenses?action=add-expense' })

    const form = await screen.findByRole('dialog', { name: 'Record expense' })
    await user.type(within(form).getByLabelText('Amount'), '450')
    await user.type(within(form).getByLabelText('Description'), 'Generator diesel')
    await user.click(within(form).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('dialog', { name: 'Review expense' })
    expect(within(review).getByText('₹450.00')).toBeInTheDocument()
    await user.click(within(review).getByRole('button', { name: 'Save expense' }))

    expect(expenseApi.createExpense).toHaveBeenCalledWith(3, expect.objectContaining({ amount: 450, description: 'Generator diesel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('status', { name: 'Address' })).toBeEmptyDOMElement()
  })

  it('keeps Review disabled and lists what is still needed until amount and description are in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExpensesPage />, { route: '/dashboard/expenses?action=add-expense' })

    const form = await screen.findByRole('dialog', { name: 'Record expense' })
    const review = within(form).getByRole('button', { name: 'Review' })
    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription('Still needed Amount Description')

    await user.type(within(form).getByLabelText('Description'), 'Generator diesel')
    expect(review).toHaveAccessibleDescription('Still needed Amount')
    await user.type(within(form).getByLabelText('Amount'), '450')
    expect(review).toBeEnabled()
  })

  it('shows the pending count beside the title and opens the form from the header button', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExpensesPage />, { route: '/dashboard/expenses' })

    expect(await screen.findByText('2 pending approval')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record expense' }))
    expect(await screen.findByRole('dialog', { name: 'Record expense' })).toBeInTheDocument()
  })
})
