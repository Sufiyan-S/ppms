import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { Settlement } from '../../api/paymentSettlementApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import PaymentSettlementsPage from './PaymentSettlementsPage'

vi.mock('../../api/paymentSettlementApi', () => ({
  paymentSettlementApi: { getWallet: vi.fn(), getPendingByAge: vi.fn(), getDailySummary: vi.fn(), getConfigs: vi.fn() },
}))

const settlement: Settlement = {
  id: 31, pumpId: 3, paymentType: 'UPI', settlementDate: '2026-11-21', amountReceived: 4500, notes: 'Morning batch',
  bankReference: 'UTR778812', recordedByUserName: 'Ravi Manager', createdAt: '2026-11-21T06:30:00Z',
  pendingAtRecordTime: 5000, isPartial: true, voidStatus: 'ACTIVE', voidReason: null, voidedAt: null,
}

function CurrentSearch() {
  return <output aria-label="Address">{useLocation().search}</output>
}

describe('PaymentSettlementsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 3 })
    vi.mocked(paymentSettlementApi.getWallet).mockResolvedValue({ upiPending: 500, cardPending: 0, fleetCardPending: 0, totalPending: 500 })
    vi.mocked(paymentSettlementApi.getPendingByAge).mockResolvedValue([])
    vi.mocked(paymentSettlementApi.getConfigs).mockResolvedValue([])
    vi.mocked(paymentSettlementApi.getDailySummary).mockResolvedValue({
      content: [{
        date: '2026-11-21', upiCollected: 5000, cardCollected: 0, fleetCardCollected: 0,
        upiSettled: 4500, cardSettled: 0, fleetCardSettled: 0, settlements: [settlement],
      }],
      page: 0, pageSize: 10, totalElements: 1, totalPages: 1, hasNext: false, hasPrevious: false,
    })
  })

  it('opens the record form from ?action=record-settlement and clears the action when cancelled', async () => {
    const user = userEvent.setup()
    renderWithProviders(<><PaymentSettlementsPage /><CurrentSearch /></>, { route: '/dashboard/settlements?action=record-settlement' })

    const dialog = await screen.findByRole('dialog', { name: 'Record settlement' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).toBeEmptyDOMElement()
  })

  it('shows a settlement in a side panel kept in the address, with its bank reference and the void action', async () => {
    const user = userEvent.setup()
    renderWithProviders(<><PaymentSettlementsPage /><CurrentSearch /></>, { route: '/dashboard/settlements' })

    await user.click(await screen.findByRole('button', { name: /Details of UPI settlement of ₹4,500.00/ }))

    const panel = screen.getByRole('dialog', { name: 'Settlement details' })
    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('settlement=31')
    expect(within(panel).getByText('UTR778812')).toBeInTheDocument()
    expect(within(panel).getByText('Ravi Manager')).toBeInTheDocument()
    expect(within(panel).getByText('Partial · ₹500.00 short')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Void' }))
    expect(screen.queryByRole('dialog', { name: 'Settlement details' })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).not.toHaveTextContent('settlement=')
  })

  it('switches to alert settings with a tab link kept in the address', async () => {
    const user = userEvent.setup()
    renderWithProviders(<><PaymentSettlementsPage /><CurrentSearch /></>, { route: '/dashboard/settlements' })

    expect(await screen.findByRole('link', { name: 'Settlement History' })).toHaveAttribute('aria-current', 'page')
    await user.click(screen.getByRole('link', { name: 'Alert Settings' }))

    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('?tab=config')
    expect(screen.getByRole('heading', { name: 'Alert Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Settlement History' })).not.toBeInTheDocument()
  })
})
