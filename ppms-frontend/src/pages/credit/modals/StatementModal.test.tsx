import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { StatementModal } from './StatementModal'

describe('StatementModal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-23T10:00:00+05:30'))
  })
  afterEach(() => vi.useRealTimers())

  function renderStatement(phone: string | null) {
    return renderWithProviders(
      <StatementModal pumpId={3} clientId={40} clientName="Sharma Transport" phone={phone} outstanding={12500}
        onClose={vi.fn()} />,
    )
  }

  it('opens the printable statement for last month and shares a WhatsApp message to the client', () => {
    renderStatement('98765 43210')

    expect(screen.getByRole('link', { name: 'Open printable statement' }))
      .toHaveAttribute('href', '/api/pumps/3/credit-ledger/40/statement?fromDate=2026-10-01&toDate=2026-10-31')
    const share = screen.getByRole('link', { name: 'Share on WhatsApp' })
    const url = new URL(share.getAttribute('href')!)
    expect(url.origin + url.pathname).toBe('https://wa.me/919876543210')
    expect(url.searchParams.get('text')).toBe(
      'Namaste Sharma Transport, your credit statement for 1 Oct 2026 to 31 Oct 2026 is ready. '
      + 'Outstanding balance today: ₹12,500.00. Please contact us to settle or to get the printed statement.')
    expect(share).toHaveAttribute('target', '_blank')
  })

  it('switches to this month and to a custom period', async () => {
    const user = userEvent.setup()
    renderStatement('9876543210')

    await user.click(screen.getByRole('button', { name: 'This month' }))
    expect(screen.getByRole('link', { name: 'Open printable statement' }))
      .toHaveAttribute('href', '/api/pumps/3/credit-ledger/40/statement?fromDate=2026-11-01&toDate=2026-11-23')

    await user.clear(screen.getByLabelText('From'))
    await user.type(screen.getByLabelText('From'), '2026-11-10')
    expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'Open printable statement' }))
      .toHaveAttribute('href', '/api/pumps/3/credit-ledger/40/statement?fromDate=2026-11-10&toDate=2026-11-23')
  })

  it('offers no WhatsApp link when the client has no usable phone', () => {
    renderStatement(null)

    expect(screen.queryByRole('link', { name: 'Share on WhatsApp' })).not.toBeInTheDocument()
    expect(screen.getByText(/Add a 10-digit mobile number/)).toBeInTheDocument()
  })
})
