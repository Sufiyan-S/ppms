import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cashApi } from '../../api/cashApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import CashDrawerPage from './CashDrawerPage'

vi.mock('../../api/cashApi', () => ({ cashApi: { getCashEvents: vi.fn(), recordCashEvent: vi.fn() } }))

function CurrentSearch() {
  return <output aria-label="Address">{useLocation().search}</output>
}

async function openEntryForm() {
  renderWithProviders(<><CashDrawerPage /><CurrentSearch /></>, { route: '/dashboard/cash?action=cash-entry' })
  const form = await screen.findByRole('dialog', { name: 'Record cash movement' })
  await within(form).findByText('₹2,000.00')
  return form
}

function figure(form: HTMLElement, label: string) {
  return within(form).getByText(label).nextElementSibling
}

describe('CashDrawerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ user: { userId: 1, fullName: 'Manager', role: 'MANAGER', assignedPumpId: 3 }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 3 })
    vi.mocked(cashApi.getCashEvents).mockResolvedValue({
      currentBalance: 2000,
      events: { content: [], page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false },
    })
  })

  it('opens the cash entry form from ?action=cash-entry and checks a cash-out against the drawer balance', async () => {
    const user = userEvent.setup()
    const form = await openEntryForm()
    await user.click(within(form).getByRole('button', { name: /^Event type/ }))
    await user.click(screen.getByRole('option', { name: 'Cash out' }))
    await user.type(within(form).getByLabelText('Amount'), '2500')
    await user.type(within(form).getByLabelText('Description'), 'Bank deposit')
    await user.click(within(form).getByRole('button', { name: 'Review' }))

    expect(within(form).getByRole('alert')).toHaveTextContent('exceeds the current drawer balance')
    expect(cashApi.recordCashEvent).not.toHaveBeenCalled()

    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).toBeEmptyDOMElement()
  })

  it('keeps Review disabled and says what is still needed until amount and description are in', async () => {
    const user = userEvent.setup()
    const form = await openEntryForm()
    const review = within(form).getByRole('button', { name: 'Review' })

    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription('Still needed Amount Description')

    await user.type(within(form).getByLabelText('Amount'), '500')
    expect(review).toHaveAccessibleDescription('Still needed Description')
    await user.type(within(form).getByLabelText('Description'), 'Change float')
    expect(review).toBeEnabled()
    expect(review).not.toHaveAccessibleDescription()
  })

  it('shows what will be in the safe after a cash-in or cash-out as the amount is typed', async () => {
    const user = userEvent.setup()
    const form = await openEntryForm()

    expect(figure(form, 'In the safe after this')).toHaveTextContent('—')
    await user.type(within(form).getByLabelText('Amount'), '750')
    expect(figure(form, 'In the safe after this')).toHaveTextContent('₹2,750.00')

    await user.click(within(form).getByRole('button', { name: /^Event type/ }))
    await user.click(screen.getByRole('option', { name: 'Cash out' }))
    expect(figure(form, 'In the safe after this')).toHaveTextContent('₹1,250.00')
  })

  it('shows the movement and the new balance on the review step before recording', async () => {
    const user = userEvent.setup()
    vi.mocked(cashApi.recordCashEvent).mockResolvedValue({} as Awaited<ReturnType<typeof cashApi.recordCashEvent>>)
    const form = await openEntryForm()
    await user.type(within(form).getByLabelText('Amount'), '300')
    await user.type(within(form).getByLabelText('Description'), 'Change float')
    await user.click(within(form).getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('dialog', { name: 'Review cash movement' })
    expect(within(review).getByText('Cash in')).toBeInTheDocument()
    expect(figure(review, 'In the safe after this')).toHaveTextContent('₹2,300.00')
    await user.click(within(review).getByRole('button', { name: 'Record movement' }))
    expect(cashApi.recordCashEvent).toHaveBeenCalledWith(3, expect.objectContaining({ eventType: 'CASH_IN', amount: 300, description: 'Change float' }))
  })
})
