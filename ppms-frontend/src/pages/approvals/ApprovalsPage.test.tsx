import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approvalApi } from '../../api/approvalApi'
import type { ApprovalItem } from '../../api/approvalApi'
import { usePumpStore } from '../../store/usePumpStore'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../test/screenWidth'
import ApprovalsPage from './ApprovalsPage'

vi.mock('../../api/approvalApi', () => ({ approvalApi: { getPending: vi.fn(), decide: vi.fn() } }))

const expense: ApprovalItem = {
  kind: 'EXPENSE', id: 7, amount: 1200, itemDate: '2026-11-20', submittedByName: 'Ravi Manager',
  submittedAt: new Date(Date.now() - 3 * 24 * 3_600_000).toISOString(), category: 'MAINTENANCE',
  clientId: null, clientName: null, note: 'Compressor repair', blockedReason: null, blockedReasonCode: null, blockedReasonParams: {},
}
const payment: ApprovalItem = {
  kind: 'CREDIT_PAYMENT', id: 12, amount: 5000, itemDate: '2026-11-22', submittedByName: 'Ravi Manager',
  submittedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), category: null,
  clientId: 40, clientName: 'Sharma Transport', note: null, blockedReason: null, blockedReasonCode: null, blockedReasonParams: {},
}
const ownPayment: ApprovalItem = {
  ...payment, id: 13, amount: 800, clientName: 'Gupta Logistics',
  blockedReason: 'You recorded this payment, so another Owner or Admin must decide it.',
}

function renderApprovals(path = '/dashboard/approvals') {
  const router = createMemoryRouter([{ path: '/dashboard/approvals', element: <ApprovalsPage /> }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: 3, suspendedPumpId: null })
    vi.mocked(approvalApi.getPending).mockResolvedValue([expense, payment, ownPayment])
    vi.mocked(approvalApi.decide).mockReset()
  })

  it('lists both kinds with submitter, age and what they are for in a captioned table', async () => {
    renderApprovals()

    const table = await screen.findByRole('table', { name: /waiting for approval/ })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(within(rows[1]).getByText('Maintenance')).toBeInTheDocument()
    expect(within(rows[1]).getByText('3 days')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Compressor repair')).toBeInTheDocument()
    expect(within(rows[2]).getByText('Sharma Transport')).toBeInTheDocument()
    expect(within(rows[2]).getByText('5 hours')).toBeInTheDocument()
    expect(within(rows[3]).getByRole('checkbox')).toBeDisabled()
  })

  it('selects every item the user may decide and approves them, then reports each result', async () => {
    const user = userEvent.setup()
    vi.mocked(approvalApi.decide).mockResolvedValue({
      succeeded: 1, failed: 1,
      results: [
        { kind: 'EXPENSE', id: 7, succeeded: true, message: null, code: null, params: null },
        { kind: 'CREDIT_PAYMENT', id: 12, succeeded: false, message: 'Approving this payment would exceed the amount still payable', code: 'CREDIT_PAYMENT_APPROVAL_EXCEEDS_PAYABLE', params: { amount: '5000.00', payable: '3000.00' } },
      ],
    })
    renderApprovals()

    await user.click(await screen.findByRole('checkbox', { name: 'Select all items' }))
    expect(screen.getByText('2 selected · ₹6,200.00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve selected' }))

    expect(approvalApi.decide).toHaveBeenCalledWith(3,
      [{ kind: 'EXPENSE', id: 7 }, { kind: 'CREDIT_PAYMENT', id: 12 }], 'APPROVED', undefined)
    expect(await screen.findByText('1 item approved. 1 could not be approved:')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Payment ₹5,000.00: Approving this payment would exceed the amount still payable')
  })

  it('asks for a reason before rejecting and sends it with the selected items', async () => {
    const user = userEvent.setup()
    vi.mocked(approvalApi.decide).mockResolvedValue({
      succeeded: 1, failed: 0, results: [{ kind: 'EXPENSE', id: 7, succeeded: true, message: null, code: null, params: null }],
    })
    renderApprovals()

    await user.click(await screen.findByRole('checkbox', { name: /Select expense Maintenance/ }))
    await user.click(screen.getByRole('button', { name: 'Reject selected' }))
    const dialog = screen.getByRole('dialog', { name: 'Reject 1 item' })
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a reason for rejecting.')
    expect(approvalApi.decide).not.toHaveBeenCalled()

    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'No bill attached')
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(approvalApi.decide).toHaveBeenCalledWith(3, [{ kind: 'EXPENSE', id: 7 }], 'REJECTED', 'No bill attached')
    expect(await screen.findByText('1 item rejected.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the kind filter in the address', async () => {
    const user = userEvent.setup()
    const router = renderApprovals('/dashboard/approvals?kind=payments')

    const table = await screen.findByRole('table', { name: /waiting for approval/ })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Credit payments' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: 'Expenses' }))
    expect(router.state.location.search).toBe('?kind=expenses')
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
  })
})

describe('ApprovalsPage on a phone', () => {
  resetScreenWidthAfterEach()

  beforeEach(() => {
    setScreenWidth(375)
    usePumpStore.setState({ selectedPumpId: 3, suspendedPumpId: null })
    vi.mocked(approvalApi.getPending).mockResolvedValue([expense, payment, ownPayment])
    vi.mocked(approvalApi.decide).mockReset()
  })

  it('shows each item as a card with large Approve and Reject buttons, and none on an item the user may not decide', async () => {
    renderApprovals()

    const table = await screen.findByRole('table', { name: /waiting for approval/ })
    expect(table).toHaveClass('ui-table-cards')
    const cards = screen.getAllByTestId('approval-card')
    expect(cards).toHaveLength(3)
    expect(within(cards[0]).getByText('Maintenance')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Expense · Ravi Manager · 3 days · 20 Nov 2026')).toBeInTheDocument()
    expect(within(cards[0]).getByText('Compressor repair')).toBeInTheDocument()
    expect(within(cards[0]).getByText('₹1,200.00')).toBeInTheDocument()

    const approve = within(cards[0]).getByRole('button', { name: 'Approve Maintenance ₹1,200.00' })
    expect(approve).toHaveClass('ui-btn')
    expect(approve).not.toHaveClass('ui-btn-compact')
    expect(within(cards[2]).queryByRole('button')).not.toBeInTheDocument()
    expect(within(cards[2]).getByRole('checkbox', { name: /Select credit payment Gupta Logistics/ })).toBeDisabled()
  })

  it('approves one item straight from its card', async () => {
    const user = userEvent.setup()
    vi.mocked(approvalApi.decide).mockResolvedValue({
      succeeded: 1, failed: 0, results: [{ kind: 'CREDIT_PAYMENT', id: 12, succeeded: true, message: null, code: null, params: null }],
    })
    renderApprovals()

    await user.click(await screen.findByRole('button', { name: 'Approve Sharma Transport ₹5,000.00' }))

    expect(approvalApi.decide).toHaveBeenCalledWith(3, [{ kind: 'CREDIT_PAYMENT', id: 12 }], 'APPROVED', undefined)
    expect(await screen.findByText('1 item approved.')).toBeInTheDocument()
  })

  it('asks for a reason before rejecting one item from its card', async () => {
    const user = userEvent.setup()
    vi.mocked(approvalApi.decide).mockResolvedValue({
      succeeded: 1, failed: 0, results: [{ kind: 'EXPENSE', id: 7, succeeded: true, message: null, code: null, params: null }],
    })
    renderApprovals()

    await user.click(await screen.findByRole('button', { name: 'Reject Maintenance ₹1,200.00' }))
    const dialog = screen.getByRole('dialog', { name: 'Reject 1 item' })
    expect(within(dialog).getByText('₹1,200.00 in total; the reason is saved with each rejection')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /Reason/ }), 'Duplicate bill')
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))

    expect(approvalApi.decide).toHaveBeenCalledWith(3, [{ kind: 'EXPENSE', id: 7 }], 'REJECTED', 'Duplicate bill')
  })

  it('still selects an item from its card for a bulk decision', async () => {
    const user = userEvent.setup()
    renderApprovals()

    await user.click(await screen.findByRole('checkbox', { name: 'Select expense Maintenance ₹1,200.00' }))

    expect(screen.getByText('1 selected · ₹1,200.00')).toBeInTheDocument()
    expect(screen.getAllByTestId('approval-card')[0]).toHaveClass('bg-info-bg')
  })
})
