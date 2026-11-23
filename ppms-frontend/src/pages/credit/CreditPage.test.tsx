import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditApi } from '../../api/creditApi'
import type { CreditAging, CreditAgingRow, CreditClient } from '../../api/creditApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../test/screenWidth'
import CreditPage from './CreditPage'

vi.mock('../../api/creditApi', () => ({ creditApi: { getLedgerSummary: vi.fn(), getAging: vi.fn() } }))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClientAccounts: vi.fn().mockResolvedValue([]) } }))
vi.mock('./CreditClientsTab', () => ({ CreditClientsTab: () => <p>Client list</p> }))
vi.mock('./ClientDetail', () => ({
  ClientDetail: ({ clientId, onBack }: { clientId: number; onBack: () => void }) => (
    <div>
      <p>Client {clientId}</p>
      <button type="button" onClick={onBack}>Back to all clients</button>
    </div>
  ),
}))

function agingRow(overrides: Partial<CreditAgingRow>): CreditAgingRow {
  return {
    clientId: 1, name: 'Client', phone: '9876543210', subAccountCount: 0, billingCycle: 'MONTHLY', creditLimit: 0,
    outstanding: 0, upTo30Days: 0, days31To60: 0, days61To90: 0, over90Days: 0, oldestUnpaidSaleDate: null,
    lastPaymentDate: null, daysOverdue: 0, creditStatus: 'OK', pendingPaymentCount: 0, pendingPaymentAmount: 0,
    ...overrides,
  }
}

const aging: CreditAging = {
  summary: { totalOutstanding: 8000, overdueAmount: 5000, overSixtyAmount: 0, overdueCount: 1, overLimitCount: 0, pendingApprovalCount: 0 },
  clients: [
    agingRow({ clientId: 1, name: 'Anand Roadways', outstanding: 3000, upTo30Days: 3000 }),
    agingRow({ clientId: 2, name: 'Bharat Cargo', outstanding: 5000, days31To60: 5000, daysOverdue: 12, creditStatus: 'OVERDUE' }),
  ],
}

function ledgerClient(id: number, name: string, outstandingBalance: number): CreditClient {
  return {
    id, pumpId: 3, name, phone: '9876543210', notes: null, creditLimit: 0, outstandingBalance, outstandingInterest: 0,
    totalInterestRecovered: 0, monthlyInterestRate: 0, interestGraceDays: 0, createdAt: '2026-01-01T00:00:00Z',
    parentClientId: null, parentClientName: null, isParent: false,
  }
}

function renderCreditAt(path: string) {
  const router = createMemoryRouter([
    { path: '/dashboard', element: <p>Overview</p> },
    { path: '/dashboard/credit', element: <CreditPage /> },
    { path: '/dashboard/credit/:clientId', element: <CreditPage /> },
  ], { initialEntries: ['/dashboard', path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// A hidden element has no accessible name, so the list is found by its label attribute while the client screen covers it.
const accountList = () => document.querySelector<HTMLElement>('nav[aria-label="Credit accounts"]')!

describe('CreditPage', () => {
  resetScreenWidthAfterEach()

  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 3 })
    vi.mocked(creditApi.getAging).mockResolvedValue(aging)
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([ledgerClient(1, 'Anand Roadways', 3000), ledgerClient(2, 'Bharat Cargo', 5000)])
  })

  describe('on a desktop', () => {
    beforeEach(() => setScreenWidth(1280))

    it('lists the accounts beside the client opened from the list, most overdue first, with status and balance', async () => {
      const user = userEvent.setup()
      const router = renderCreditAt('/dashboard/credit')

      const first = await screen.findByRole('link', { name: /Bharat Cargo/ })
      expect(first).toHaveTextContent('12 days overdue')
      expect(first).toHaveTextContent('₹5,000.00')
      expect(within(accountList()).getAllByRole('link').map(link => link.textContent)).toEqual([
        expect.stringContaining('Bharat Cargo'), expect.stringContaining('Anand Roadways'),
      ])
      expect(screen.getByText(/Choose a client/)).toBeInTheDocument()

      await user.click(first)

      expect(await screen.findByText('Client 2')).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/dashboard/credit/2')
      expect(screen.getByRole('link', { name: /Bharat Cargo/ })).toHaveAttribute('aria-current', 'page')
      expect(accountList()).toBeVisible()
    })

    it('opens a shared client link with the list beside it and keeps the list filters in the address', async () => {
      const user = userEvent.setup()
      const router = renderCreditAt('/dashboard/credit/1?filter=overdue')

      expect(await screen.findByText('Client 1')).toBeInTheDocument()
      expect(await screen.findByRole('link', { name: /Bharat Cargo/ })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Anand Roadways/ })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Overdue (1)' })).toHaveAttribute('aria-pressed', 'true')

      await user.click(screen.getByRole('link', { name: /Bharat Cargo/ }))
      expect(router.state.location.pathname).toBe('/dashboard/credit/2')
      expect(router.state.location.search).toBe('?filter=overdue')
    })

    it('sorts the list from the sort menu and keeps the order in the address', async () => {
      const user = userEvent.setup()
      const router = renderCreditAt('/dashboard/credit')
      await screen.findByRole('link', { name: /Bharat Cargo/ })

      await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'name')

      expect(within(accountList()).getAllByRole('link')[0]).toHaveTextContent('Anand Roadways')
      expect(router.state.location.search).toBe('?sort=name&dir=asc')
    })
  })

  describe('on a phone', () => {
    beforeEach(() => setScreenWidth(390))

    it('shows the client on its own screen and comes back to the same filtered list', async () => {
      const user = userEvent.setup()
      const router = renderCreditAt('/dashboard/credit?filter=overdue')

      await user.click(await screen.findByRole('link', { name: /Bharat Cargo/ }))

      expect(await screen.findByText('Client 2')).toBeInTheDocument()
      expect(accountList()).not.toBeVisible()

      await user.click(screen.getByRole('button', { name: 'Back to list' }))

      expect(router.state.location.pathname).toBe('/dashboard/credit')
      expect(router.state.location.search).toBe('?filter=overdue')
      expect(accountList()).toBeVisible()
      expect(screen.queryByText('Client 2')).not.toBeInTheDocument()
    })

    it('returns to the list with the browser Back button', async () => {
      const user = userEvent.setup()
      const router = renderCreditAt('/dashboard/credit')

      await user.click(await screen.findByRole('link', { name: /Anand Roadways/ }))
      expect(await screen.findByText('Client 1')).toBeInTheDocument()

      await act(() => router.navigate(-1))

      expect(router.state.location.pathname).toBe('/dashboard/credit')
      expect(accountList()).toBeVisible()
    })
  })

  it('keeps the chosen tab in the address, with tabs as links', async () => {
    const user = userEvent.setup()
    const router = renderCreditAt('/dashboard/credit')

    const clientsTab = await screen.findByRole('link', { name: 'Clients' })
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveAttribute('aria-current', 'page')
    await user.click(clientsTab)

    expect(await screen.findByText('Client list')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?tab=clients')
    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the aging table and opens a client from it in the ledger view', async () => {
    const user = userEvent.setup()
    const router = renderCreditAt('/dashboard/credit?tab=aging&filter=overdue')

    expect(await screen.findByRole('table', { name: /unpaid balance by age/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Credit aging summary' })).toHaveTextContent('₹8,000.00')

    await user.click(screen.getByRole('button', { name: 'View ledger of Bharat Cargo' }))

    expect(router.state.location.pathname).toBe('/dashboard/credit/2')
    expect(router.state.location.search).toBe('?filter=overdue')
    expect(await screen.findByText('Client 2')).toBeInTheDocument()
  })

  it('asks which client paid when Record payment starts with no client open, then opens that client', async () => {
    const user = userEvent.setup()
    const router = renderCreditAt('/dashboard/credit?action=record-payment')

    const dialog = await screen.findByRole('dialog', { name: 'Record payment' })
    await user.type(within(dialog).getByRole('searchbox', { name: 'Find client' }), 'bharat')
    expect(within(dialog).queryByRole('button', { name: /Anand Roadways/ })).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Bharat Cargo/ }))

    expect(router.state.location.pathname).toBe('/dashboard/credit/2')
    expect(router.state.location.search).toBe('?action=record-payment')
    expect(await screen.findByText('Client 2')).toBeInTheDocument()
  })

  it('starts Record payment from the header button', async () => {
    const user = userEvent.setup()
    const router = renderCreditAt('/dashboard/credit')

    await user.click(await screen.findByRole('button', { name: 'Record payment' }))

    expect(router.state.location.search).toBe('?action=record-payment')
    expect(await screen.findByRole('dialog', { name: 'Record payment' })).toBeInTheDocument()
  })
})
