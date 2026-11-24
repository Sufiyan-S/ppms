import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreditTransaction } from '../../api/creditApi'
import { changeAppLanguage } from '../../i18n'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../test/screenWidth'
import type { LedgerRowActions } from './LedgerEntryActions'
import { LedgerWeekGroups } from './LedgerWeekGroups'

const actions: LedgerRowActions = {
  canMoveEntries: false, canWaiveInterest: false, canApprovePayments: false, currentUserId: 1,
  pendingPaymentRecorders: new Map(), approvePayment: vi.fn(), onRejectPayment: vi.fn(), isApproving: false,
  onMove: vi.fn(), onWaiveInterest: vi.fn(),
}

function row(overrides: Partial<CreditTransaction>): CreditTransaction {
  return {
    type: 'SALE', referenceId: 1, reference: null, referenceCode: null, referenceParams: {}, detail: null, amount: 100, runningBalance: 100,
    occurredAt: '2026-11-10T06:00:00Z', businessDate: '2026-11-10', status: 'ACTIVE', countedInBalance: true,
    ...overrides,
  }
}

describe('LedgerWeekGroups shop sales', () => {
  it('labels a shop sale on credit, shows what was sold and adds it to the week sales without a Move action', () => {
    render(
      <LedgerWeekGroups
        srcClientId={7}
        actions={{ ...actions, canMoveEntries: true }}
        groups={[{ label: 'Week', items: [
          row({ referenceId: 1, type: 'COUNTER_SALE', reference: 'Castrol Engine Oil 1 L × 2 (Bill B-42)', amount: 800 }),
          row({ referenceId: 2, detail: 'PETROL', amount: 200 }),
        ] }]}
      />,
    )

    expect(screen.getByText('Shop sale')).toBeInTheDocument()
    expect(screen.getByText('Castrol Engine Oil 1 L × 2 (Bill B-42)')).toBeInTheDocument()
    expect(screen.getByText('+₹1,000.00 sales')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Move' })).toHaveLength(1)
  })
})

describe('LedgerWeekGroups server-written references', () => {
  afterEach(async () => {
    await changeAppLanguage('en')
  })

  it('shows a shop sale and a payment by unknown staff in the chosen language', async () => {
    await changeAppLanguage('hi')
    render(
      <LedgerWeekGroups
        srcClientId={7}
        actions={actions}
        groups={[{ label: 'Week', items: [
          row({
            referenceId: 1, type: 'COUNTER_SALE', reference: 'Castrol Engine Oil — 1 LITRE × 2 (Bill B-42)',
            referenceCode: 'COUNTER_SALE_DETAILS_WITH_BILL',
            referenceParams: { productName: 'Castrol Engine Oil — 1 LITRE', quantity: 2, billNo: 'B-42' },
          }),
          row({
            referenceId: 2, type: 'PAYMENT', reference: 'Unknown staff', referenceCode: 'UNKNOWN_STAFF',
            detail: 'CASH', status: 'APPROVED',
          }),
        ] }]}
      />,
    )

    expect(screen.getByText('Castrol Engine Oil — 1 LITRE × 2 (बिल B-42)')).toBeInTheDocument()
    expect(screen.getByText('अज्ञात कर्मचारी')).toBeInTheDocument()
    expect(screen.queryByText('Unknown staff')).not.toBeInTheDocument()
  })

  it('keeps the server English for English users', () => {
    render(
      <LedgerWeekGroups
        srcClientId={7}
        actions={actions}
        groups={[{ label: 'Week', items: [
          row({
            referenceId: 1, type: 'COUNTER_SALE', reference: 'Engine Oil — 1 LITRE × 3',
            referenceCode: 'COUNTER_SALE_DETAILS', referenceParams: { productName: 'Engine Oil — 1 LITRE', quantity: 3 },
          }),
          row({ referenceId: 2, type: 'PAYMENT', reference: 'Unknown staff', referenceCode: 'UNKNOWN_STAFF', status: 'APPROVED' }),
        ] }]}
      />,
    )

    expect(screen.getByText('Engine Oil — 1 LITRE × 3')).toBeInTheDocument()
    expect(screen.getByText('Unknown staff')).toBeInTheDocument()
  })
})

describe('LedgerWeekGroups detail column', () => {
  it('shows the fuel name and payment mode as words, and leaves an interest period as sent', () => {
    render(
      <LedgerWeekGroups
        srcClientId={7}
        actions={actions}
        groups={[{ label: 'Week', items: [
          row({ referenceId: 1, detail: 'SPEED_PETROL' }),
          row({ referenceId: 2, type: 'PAYMENT', detail: 'BANK_TRANSFER', status: 'APPROVED' }),
          row({ referenceId: 3, type: 'INTEREST', detail: '2026-11-01 – 2026-11-07' }),
        ] }]}
      />,
    )

    expect(screen.getByText('Speed Petrol')).toBeInTheDocument()
    expect(screen.queryByText('SPEED_PETROL')).not.toBeInTheDocument()
    expect(screen.getByText('Bank transfer')).toBeInTheDocument()
    expect(screen.getByText('2026-11-01 – 2026-11-07')).toBeInTheDocument()
  })
})

describe('LedgerWeekGroups interest waiver', () => {
  it('offers Waive only on interest that is still owed and marks a waived charge', () => {
    render(
      <LedgerWeekGroups
        srcClientId={7}
        actions={{ ...actions, canWaiveInterest: true }}
        groups={[{ label: 'Week', items: [
          row({ referenceId: 3, type: 'INTEREST', detail: 'October' }),
          row({ referenceId: 4, type: 'INTEREST', detail: 'September', status: 'WAIVED', countedInBalance: false }),
        ] }]}
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Waive this interest charge' })).toHaveLength(1)
    expect(screen.getByText('Waived')).toBeInTheDocument()
  })

  it('hides Waive from someone who may not waive interest', () => {
    render(
      <LedgerWeekGroups
        srcClientId={7}
        actions={actions}
        groups={[{ label: 'Week', items: [row({ referenceId: 3, type: 'INTEREST', detail: 'October' })] }]}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Waive this interest charge' })).not.toBeInTheDocument()
  })
})

describe('LedgerWeekGroups on a phone', () => {
  resetScreenWidthAfterEach()

  it('stacks each entry with its date, description, signed amount and running balance instead of a wide table', async () => {
    setScreenWidth(375)
    const user = userEvent.setup()
    const approvePayment = vi.fn()
    render(
      <LedgerWeekGroups
        srcClientId={7}
        actions={{ ...actions, canApprovePayments: true, pendingPaymentRecorders: new Map([[2, 99]]), approvePayment }}
        groups={[{ label: 'Week of 10 Nov', items: [
          row({ referenceId: 1, detail: 'PETROL', amount: 500, runningBalance: 1500 }),
          row({ referenceId: 2, type: 'PAYMENT', detail: 'CASH', amount: 400, runningBalance: 1100, status: 'PENDING_APPROVAL' }),
        ] }]}
      />,
    )

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Transactions, Week of 10 Nov' })
    const [sale, payment] = within(list).getAllByTestId('ledger-entry')

    expect(within(sale).getByText('10 Nov')).toBeInTheDocument()
    expect(within(sale).getByText('Petrol')).toBeInTheDocument()
    expect(within(sale).getByText('+₹500.00')).toHaveClass('text-warn')
    expect(within(sale).getByText('₹1,500.00')).toBeInTheDocument()
    expect(within(payment).getByText('−₹400.00')).toHaveClass('text-ok')
    expect(within(payment).getByText('Cash')).toBeInTheDocument()

    await user.click(within(payment).getByRole('button', { name: 'Approve' }))
    expect(approvePayment).toHaveBeenCalledWith(2)
  })

  it('keeps the table from tablet width up', () => {
    setScreenWidth(1024)
    render(<LedgerWeekGroups srcClientId={7} actions={actions} groups={[{ label: 'Week', items: [row({})] }]} />)

    expect(screen.getByRole('table', { name: 'Transactions, Week' })).toHaveClass('min-w-208')
    expect(screen.queryByTestId('ledger-entry')).not.toBeInTheDocument()
  })
})
