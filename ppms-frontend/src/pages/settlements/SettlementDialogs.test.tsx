import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { Settlement } from '../../api/paymentSettlementApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { RecordSettlementDialog } from './RecordSettlementDialog'
import { VoidSettlementDialog } from './VoidSettlementDialog'

vi.mock('../../api/paymentSettlementApi', () => ({ paymentSettlementApi: { record: vi.fn(), voidSettlement: vi.fn() } }))

const wallet = { upiPending: 5000, cardPending: 1200, fleetCardPending: 0, totalPending: 6200 }

function figure(label: string) {
  return screen.getByText(label).closest('div')?.querySelector('dd')
}

function renderRecord() {
  renderWithProviders(<RecordSettlementDialog pumpId={3} wallet={wallet} pendingRanges={[]} initialType="UPI" onClose={vi.fn()} />)
}

describe('RecordSettlementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(paymentSettlementApi.record).mockResolvedValue({} as Settlement)
  })

  it('shows what is still pending for the chosen type as the amount is typed', async () => {
    const user = userEvent.setup()
    renderRecord()

    expect(figure('UPI pending now')).toHaveTextContent('₹5,000.00')
    expect(figure('Still pending after this')).toHaveTextContent('—')

    await user.type(screen.getByLabelText('Amount received'), '4500')
    expect(figure('This settlement')).toHaveTextContent('₹4,500.00')
    expect(figure('Still pending after this')).toHaveTextContent('₹500.00')

    await user.click(screen.getByRole('button', { name: 'Card' }))
    expect(figure('Card pending now')).toHaveTextContent('₹1,200.00')
    expect(screen.getByLabelText('Amount received')).toHaveAccessibleDescription(/more than the ₹1,200.00 still pending for Card/)
  })

  it('says the type is fully settled when the amount clears it', async () => {
    const user = userEvent.setup()
    renderRecord()
    await user.type(screen.getByLabelText('Amount received'), '5000')
    expect(figure('Still pending after this')).toHaveTextContent('Fully settled')
  })

  it('keeps Record settlement disabled until an amount is entered, then records it', async () => {
    const user = userEvent.setup()
    renderRecord()
    const record = screen.getByRole('button', { name: 'Record settlement' })

    expect(record).toBeDisabled()
    expect(record).toHaveAccessibleDescription('Still needed Amount received')

    await user.type(screen.getByLabelText('Amount received'), '2000')
    await user.click(record)
    expect(paymentSettlementApi.record).toHaveBeenCalledWith(3, expect.objectContaining({ paymentType: 'UPI', amountReceived: 2000 }))
  })
})

describe('VoidSettlementDialog', () => {
  const settlement = {
    id: 31, pumpId: 3, paymentType: 'UPI', settlementDate: '2026-11-20', amountReceived: 4500, notes: null,
    bankReference: 'UTR1', recordedByUserName: 'Ravi', createdAt: '2026-11-20T10:00:00Z', pendingAtRecordTime: 5000,
    isPartial: true, voidStatus: 'ACTIVE', voidReason: null, voidedAt: null,
  } as Settlement

  it('states how much the pending balance goes back up and needs a reason before voiding', async () => {
    const user = userEvent.setup()
    vi.mocked(paymentSettlementApi.voidSettlement).mockResolvedValue({} as Settlement)
    renderWithProviders(<VoidSettlementDialog pumpId={3} voidTarget={settlement} onClose={vi.fn()} />)

    expect(figure('UPI pending goes up by')).toHaveTextContent('+₹4,500.00')
    const voidButton = screen.getByRole('button', { name: 'Void settlement' })
    expect(voidButton).toBeDisabled()
    expect(voidButton).toHaveAccessibleDescription('Still needed Reason')

    await user.type(screen.getByLabelText('Reason'), 'Recorded twice')
    await user.click(voidButton)
    expect(paymentSettlementApi.voidSettlement).toHaveBeenCalledWith(3, 31, 'Recorded twice')
  })
})
