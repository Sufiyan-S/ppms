import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cashApi } from '../../../api/cashApi'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient, CreditPayment } from '../../../api/creditApi'
import { expenseApi } from '../../../api/expenseApi'
import { paymentSettlementApi } from '../../../api/paymentSettlementApi'
import { useAuthStore } from '../../../store/authStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { UserRole } from '../../../types/auth'
import { MoneyOverview } from './MoneyOverview'

vi.mock('../../../api/cashApi', () => ({ cashApi: { getCashEvents: vi.fn() } }))
vi.mock('../../../api/creditApi', () => ({ creditApi: { getLedgerSummary: vi.fn(), getPendingPayments: vi.fn() } }))
vi.mock('../../../api/expenseApi', () => ({ expenseApi: { getSummary: vi.fn() } }))
vi.mock('../../../api/paymentSettlementApi', () => ({ paymentSettlementApi: { getWallet: vi.fn() } }))

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: 6 }, isAuthenticated: true })
}

function tile(label: string) {
  return screen.getByText(label).closest('a') as HTMLElement
}

describe('MoneyOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(cashApi.getCashEvents).mockResolvedValue({ currentBalance: 12_500, events: {} } as Awaited<ReturnType<typeof cashApi.getCashEvents>>)
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([
      { id: 1, parentClientId: null, outstandingBalance: 5_000 },
      { id: 2, parentClientId: 1, outstandingBalance: 2_000 },
      { id: 3, parentClientId: null, outstandingBalance: 1_000 },
    ] as CreditClient[])
    vi.mocked(expenseApi.getSummary).mockResolvedValue({ approvedTotal: 0, pendingCount: 2, pendingTotal: 900 })
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([{ id: 9 }] as CreditPayment[])
    vi.mocked(paymentSettlementApi.getWallet).mockResolvedValue({ upiPending: 700, cardPending: 300, fleetCardPending: 0, totalPending: 1_000 })
  })

  it('shows the drawer cash, credit owed without counting sub-accounts twice, approvals and unsettled money', async () => {
    signIn('OWNER')
    renderWithProviders(<MoneyOverview pumpId={6} />)

    expect(await within(tile('Cash in drawer')).findByText('₹12,500.00')).toBeInTheDocument()
    expect(await within(tile('Credit outstanding')).findByText('₹6,000.00')).toBeInTheDocument()
    expect(await within(tile('Waiting for approval')).findByText('3')).toBeInTheDocument()
    expect(await within(tile('Not yet settled')).findByText('₹1,000.00')).toBeInTheDocument()
    expect(tile('Cash in drawer')).toHaveAttribute('href', '/dashboard/cash')
  })

  it('does not ask for pending credit payments as a manager, who cannot approve them', async () => {
    signIn('MANAGER')
    renderWithProviders(<MoneyOverview pumpId={6} />)

    expect(await within(tile('Waiting for approval')).findByText('2')).toBeInTheDocument()
    expect(creditApi.getPendingPayments).not.toHaveBeenCalled()
  })

  it('says the figures could not load, rather than showing blanks, and retries only what failed', async () => {
    signIn('OWNER')
    const user = userEvent.setup()
    vi.mocked(cashApi.getCashEvents).mockRejectedValueOnce(new Error('down'))
    renderWithProviders(<MoneyOverview pumpId={6} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this.')
    expect(cashApi.getCashEvents).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await within(tile('Cash in drawer')).findByText('₹12,500.00')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(expenseApi.getSummary).toHaveBeenCalledOnce()
  })
})
