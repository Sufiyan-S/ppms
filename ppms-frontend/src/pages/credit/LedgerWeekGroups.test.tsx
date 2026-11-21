import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CreditTransaction } from '../../api/creditApi'
import { LedgerWeekGroups, type LedgerRowActions } from './LedgerWeekGroups'

const actions: LedgerRowActions = {
  canMoveEntries: false, canDeleteInterest: false, canApprovePayments: false, currentUserId: 1,
  pendingPaymentRecorders: new Map(), approvePayment: vi.fn(), isApproving: false,
  onMove: vi.fn(), deleteInterest: vi.fn(), isDeletingInterest: false,
}

function row(overrides: Partial<CreditTransaction>): CreditTransaction {
  return {
    type: 'SALE', referenceId: 1, reference: null, detail: null, amount: 100, runningBalance: 100,
    occurredAt: '2026-11-10T06:00:00Z', businessDate: '2026-11-10', status: 'ACTIVE', countedInBalance: true,
    ...overrides,
  }
}

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
