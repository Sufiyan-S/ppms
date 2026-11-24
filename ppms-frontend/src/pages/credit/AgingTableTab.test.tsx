import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditApi } from '../../api/creditApi'
import type { CreditAging, CreditAgingRow } from '../../api/creditApi'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../test/screenWidth'
import { AgingTableTab } from './AgingTableTab'
import { AgingSummary } from './AgingSummary'
import { useCreditAging } from './useCreditAging'

vi.mock('../../api/creditApi', () => ({ creditApi: { getAging: vi.fn() } }))

function row(overrides: Partial<CreditAgingRow>): CreditAgingRow {
  return {
    clientId: 1, name: 'Client', phone: '9876543210', subAccountCount: 0, billingCycle: 'MONTHLY', creditLimit: 0,
    outstanding: 0, upTo30Days: 0, days31To60: 0, days61To90: 0, over90Days: 0, oldestUnpaidSaleDate: null,
    lastPaymentDate: null, daysOverdue: 0, creditStatus: 'OK', pendingPaymentCount: 0, pendingPaymentAmount: 0,
    ...overrides,
  }
}

const aging: CreditAging = {
  summary: {
    totalOutstanding: 23000, overdueAmount: 15000, overSixtyAmount: 9000,
    overdueCount: 2, overLimitCount: 1, pendingApprovalCount: 1,
  },
  clients: [
    row({ clientId: 1, name: 'Anand Roadways', outstanding: 3000, upTo30Days: 3000, pendingPaymentCount: 1 }),
    row({ clientId: 2, name: 'Bharat Cargo', outstanding: 5000, days31To60: 5000, daysOverdue: 12, creditStatus: 'OVERDUE' }),
    row({
      clientId: 3, name: 'City Transport', outstanding: 10000, upTo30Days: 1000, days61To90: 9000, daysOverdue: 40,
      creditStatus: 'OVERDUE', subAccountCount: 2,
    }),
    row({ clientId: 4, name: 'Delta Fuels', outstanding: 5000, upTo30Days: 5000, creditLimit: 4000, creditStatus: 'OVER_LIMIT' }),
  ],
}

function AgingTableWithSummary() {
  const view = useCreditAging(3)
  return (
    <>
      {view.aging && <AgingSummary summary={view.aging.summary} />}
      <AgingTableTab pumpId={3} view={view} clients={[]} canAdjustLimit={false} onOpenClient={vi.fn()} />
    </>
  )
}

function renderLedger(path: string) {
  const router = createMemoryRouter([{ path: '/dashboard/credit', element: <AgingTableWithSummary /> }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function clientNames() {
  const table = await screen.findByRole('table', { name: /unpaid balance by age/ })
  return within(table).getAllByRole('rowheader').map(header => within(header).getByRole('button').textContent)
}

describe('AgingTableTab credit aging', () => {
  beforeEach(() => {
    vi.mocked(creditApi.getAging).mockResolvedValue(aging)
  })

  it('shows the summary strip and lists the most overdue clients first by default', async () => {
    renderLedger('/dashboard/credit?tab=ledger')

    expect(await clientNames()).toEqual(['City Transport', 'Bharat Cargo', 'Delta Fuels', 'Anand Roadways'])
    const summary = screen.getByRole('region', { name: 'Credit aging summary' })
    expect(within(summary).getByText('₹23,000.00')).toBeInTheDocument()
    expect(within(summary).getByText('₹15,000.00')).toBeInTheDocument()
    expect(within(summary).getByText('₹9,000.00')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Days overdue' })).toHaveAttribute('aria-sort', 'descending')
  })

  it('opens filtered from a deep link and keeps the chosen filter in the address', async () => {
    const user = userEvent.setup()
    const router = renderLedger('/dashboard/credit?tab=ledger&filter=overdue')

    expect(await clientNames()).toEqual(['City Transport', 'Bharat Cargo'])
    expect(screen.getByRole('button', { name: 'Overdue (2)' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Over limit (1)' }))
    expect(await clientNames()).toEqual(['Delta Fuels'])
    expect(router.state.location.search).toBe('?tab=ledger&filter=over-limit')

    await user.click(screen.getByRole('button', { name: 'Pending approval (1)' }))
    expect(await clientNames()).toEqual(['Anand Roadways'])
  })

  it('sorts by a column header, flips on a second click and keeps the sort in the address', async () => {
    const user = userEvent.setup()
    const router = renderLedger('/dashboard/credit?tab=ledger')
    await clientNames()

    await user.click(screen.getByRole('button', { name: 'Client' }))
    expect(await clientNames()).toEqual(['Anand Roadways', 'Bharat Cargo', 'City Transport', 'Delta Fuels'])
    expect(screen.getByRole('columnheader', { name: 'Client' })).toHaveAttribute('aria-sort', 'ascending')
    expect(router.state.location.search).toBe('?tab=ledger&sort=name&dir=asc')

    await user.click(screen.getByRole('button', { name: 'Outstanding' }))
    expect(await clientNames()).toEqual(['City Transport', 'Bharat Cargo', 'Delta Fuels', 'Anand Roadways'])
    await user.click(screen.getByRole('button', { name: 'Outstanding' }))
    expect(router.state.location.search).toBe('?tab=ledger&sort=outstanding&dir=asc')
    expect((await clientNames())[0]).toBe('Anand Roadways')
  })
})

describe('AgingTableTab credit aging on a phone', () => {
  resetScreenWidthAfterEach()

  beforeEach(() => {
    setScreenWidth(375)
    vi.mocked(creditApi.getAging).mockResolvedValue(aging)
  })

  it('shows each client as a card with the total and only the age buckets that hold money', async () => {
    renderLedger('/dashboard/credit?tab=ledger')

    const table = await screen.findByRole('table', { name: /unpaid balance by age/ })
    expect(table).toHaveClass('ui-table-cards')
    const cards = screen.getAllByTestId('aging-card')
    expect(cards).toHaveLength(4)

    const city = cards[0]
    expect(within(city).getByRole('button', { name: 'City Transport' })).toBeInTheDocument()
    expect(within(city).getByText('₹10,000.00')).toBeInTheDocument()
    const terms = within(city).getAllByRole('term')
    expect(terms.map(term => term.textContent)).toEqual(['0–30 days', '61–90 days'])
    expect(terms[1].nextElementSibling).toHaveTextContent('₹9,000.00')
    expect(terms[0].closest('dl')).toHaveAttribute('aria-label', 'Outstanding by age')
    expect(within(city).getByText('40 days overdue')).toBeInTheDocument()
    expect(within(city).getByRole('button', { name: 'View ledger of City Transport' })).not.toHaveClass('ui-btn-compact')
    expect(screen.queryByRole('columnheader', { name: '31–60' })).not.toBeInTheDocument()
  })

  it('offers a sort menu because the column headers are hidden on a phone', async () => {
    const user = userEvent.setup()
    const router = renderLedger('/dashboard/credit?tab=ledger')
    await screen.findAllByTestId('aging-card')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'name')

    expect(router.state.location.search).toContain('sort=name')
    expect(within(screen.getAllByTestId('aging-card')[0]).getByRole('button', { name: 'Anand Roadways' })).toBeInTheDocument()
  })
})
