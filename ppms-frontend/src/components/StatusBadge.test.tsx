import { render, screen } from '@testing-library/react'
import { Check } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'
import {
  approvalStatusBadge, creditStandingBadge, creditTransactionBadge, discrepancyBadge, invoiceStatusBadge, settlementOverdueBadge, shiftStatusBadge,
} from './statusBadges'

describe('StatusBadge', () => {
  it('shows the label as its text and hides the icon from screen readers', () => {
    const { container } = render(<StatusBadge tone="ok" icon={Check} label="Balanced" />)
    expect(screen.getByText('Balanced')).toHaveClass('bg-ok-bg', 'text-ok', 'rounded-badge')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders without an icon', () => {
    const { container } = render(<StatusBadge tone="neutral" label="Backfilled" />)
    expect(screen.getByText('Backfilled')).toHaveClass('bg-neutral-bg', 'text-neutral')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('stays on one line unless asked to wrap', () => {
    render(<><StatusBadge tone="ok" label="Approved" /><StatusBadge tone="bad" label="Rejected: wrong bill" wrap /></>)
    expect(screen.getByText('Approved')).toHaveClass('whitespace-nowrap')
    expect(screen.getByText('Rejected: wrong bill')).not.toHaveClass('whitespace-nowrap')
  })
})

describe('status badge specs', () => {
  it('uses the shift status wording from the shift labels', () => {
    expect(shiftStatusBadge('CLOSED_DISCREPANCY_PENDING_APPROVAL')).toMatchObject({ tone: 'warn', label: 'Needs Approval' })
    expect(shiftStatusBadge('OPEN')).toMatchObject({ tone: 'ok', label: 'Open' })
  })

  it('marks a shortage bad, an excess warn and no discrepancy ok', () => {
    expect(discrepancyBadge('SHORT')).toMatchObject({ tone: 'bad', label: 'Short' })
    expect(discrepancyBadge('OVER')).toMatchObject({ tone: 'warn', label: 'Over' })
    expect(discrepancyBadge(null)).toMatchObject({ tone: 'ok', label: 'Balanced' })
  })

  it('reads approval, invoice and credit standing codes as words', () => {
    expect(approvalStatusBadge('PENDING_APPROVAL')).toMatchObject({ tone: 'warn', label: 'Pending approval' })
    expect(approvalStatusBadge('REJECTED')).toMatchObject({ tone: 'bad', label: 'Rejected' })
    expect(invoiceStatusBadge('CANCELLED')).toMatchObject({ tone: 'bad', label: 'Cancelled' })
    expect(invoiceStatusBadge('ISSUED')).toMatchObject({ tone: 'ok', label: 'Issued' })
    expect(creditStandingBadge('OK')).toMatchObject({ tone: 'ok', label: 'OK' })
    expect(creditStandingBadge('OVER_LIMIT')).toMatchObject({ tone: 'warn', label: 'Over limit' })
    expect(settlementOverdueBadge()).toMatchObject({ tone: 'bad', label: 'Overdue' })
  })

  it('reads a credit ledger row by its status first, then its type', () => {
    expect(creditTransactionBadge({ type: 'SALE', status: 'VOIDED' })).toMatchObject({ tone: 'neutral', label: 'Voided' })
    expect(creditTransactionBadge({ type: 'PAYMENT', status: 'PENDING_APPROVAL' })).toMatchObject({ tone: 'warn', label: 'Pending approval' })
    expect(creditTransactionBadge({ type: 'COUNTER_SALE', status: 'ACTIVE' })).toMatchObject({ tone: 'warn', label: 'Shop sale' })
    expect(creditTransactionBadge({ type: 'INTEREST', status: 'ACTIVE' })).toMatchObject({ tone: 'info', label: 'Interest' })
    expect(creditTransactionBadge({ type: 'PAYMENT', status: 'APPROVED' })).toMatchObject({ tone: 'ok', label: 'Paid' })
  })
})
