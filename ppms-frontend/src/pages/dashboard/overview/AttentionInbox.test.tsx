import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { attentionApi } from '../../../api/attentionApi'
import type { AttentionItem } from '../../../api/attentionApi'
import { usePumpStore } from '../../../store/usePumpStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { AttentionInbox } from './AttentionInbox'

vi.mock('../../../api/attentionApi', () => ({ attentionApi: { getForPump: vi.fn(), getForMyPumps: vi.fn() } }))

function item(overrides: Partial<AttentionItem>): AttentionItem {
  return {
    type: 'PENDING_APPROVALS', severity: 'MEDIUM', pumpId: 4, pumpName: 'Highway Pump', count: 3, amount: 1500,
    reason: '2 expenses and 1 credit payment waiting for your approval',
    reasonCode: 'ATTENTION_PENDING_EXPENSES_AND_CREDIT_PAYMENTS', reasonParams: { expenseCount: 2, paymentCount: 1 },
    targetPath: '/dashboard/approvals',
    ...overrides,
  }
}

const overdue = item({
  type: 'OVERDUE_CREDIT', severity: 'HIGH', count: 2, amount: 48250.5,
  reason: '2 credit clients past the billing cycle without paying',
  targetPath: '/dashboard/credit?tab=ledger&filter=overdue',
})

describe('AttentionInbox', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null })
  })

  it('lists each item with its figure and a link to the filtered page, in the order given', async () => {
    vi.mocked(attentionApi.getForPump).mockResolvedValue([overdue, item({})])
    renderWithProviders(<AttentionInbox pumpId={4} allPumps={false} />)

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('2 credit clients past the billing cycle without paying')).toBeInTheDocument()
    expect(within(rows[0]).getByText('₹48,250.50')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('link', { name: 'Review: 2 credit clients past the billing cycle without paying' }))
      .toHaveAttribute('href', '/dashboard/credit?tab=ledger&filter=overdue')
    expect(within(rows[1]).getByRole('link', { name: /Review: 2 expenses/ })).toHaveAttribute('href', '/dashboard/approvals')
  })

  it('shows a count when the item is not about money', async () => {
    vi.mocked(attentionApi.getForPump).mockResolvedValue([item({
      type: 'EXPIRING_DOCUMENTS', amount: null, count: 2, reason: '2 documents expiring within 30 days',
      targetPath: '/dashboard/documents',
    })])
    renderWithProviders(<AttentionInbox pumpId={4} allPumps={false} />)

    const row = await screen.findByRole('listitem')
    expect(within(row).getByText('2')).toBeInTheDocument()
  })

  it('says all clear when nothing needs attention', async () => {
    vi.mocked(attentionApi.getForPump).mockResolvedValue([])
    renderWithProviders(<AttentionInbox pumpId={4} allPumps={false} />)

    expect(await screen.findByRole('status')).toHaveTextContent('All clear for today')
  })

  it('switches to the other pump before opening an item of another pump in the all pumps view', async () => {
    const user = userEvent.setup()
    vi.mocked(attentionApi.getForMyPumps).mockResolvedValue([item({ pumpId: 9, pumpName: 'City Pump' })])
    const router = createMemoryRouter([
      { path: '/dashboard', element: <AttentionInbox pumpId={null} allPumps /> },
      { path: '/dashboard/approvals', element: <p>Approval queue</p> },
    ], { initialEntries: ['/dashboard'] })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: /Review: City Pump, 2 expenses/ }))

    expect(await screen.findByText('Approval queue')).toBeInTheDocument()
    expect(usePumpStore.getState().selectedPumpId).toBe(9)
  })
})
