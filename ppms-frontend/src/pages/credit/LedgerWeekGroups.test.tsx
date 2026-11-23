import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CreditTransaction } from '../../api/creditApi'
import { LedgerWeekGroups, type LedgerRowActions } from './LedgerWeekGroups'

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
