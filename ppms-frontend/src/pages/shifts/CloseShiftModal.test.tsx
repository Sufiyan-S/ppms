import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import { shiftApi } from '../../api/shiftApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { Shift } from '../../types/shift'
import CloseShiftModal from './CloseShiftModal'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn() } }))
vi.mock('../../api/shiftApi', () => ({ shiftApi: { closeShift: vi.fn(), voidCreditEntry: vi.fn() } }))

const shift: Shift = {
  id: 11, pumpId: 3, duId: 5, duNumber: 1, duName: 'DU 1',
  nozzles: [{ id: 21, nozzleNumber: 1, fuelType: 'PETROL' }],
  operatorId: 9, operatorName: 'Ravi', openedByUserName: 'Owner', shiftWindow: 'MORNING',
  shiftDate: '2026-03-15', actualStartTime: '2026-03-15T00:30:00Z', actualEndTime: null, scheduledEndTime: null,
  fuelReadings: [{
    nozzleId: 21, fuelType: 'PETROL', startReading: 1000, endReading: null,
    priceSnapshot: 100, unitsSold: null, maxMeterValue: 999_999,
  }],
  totalAmountDue: null, cashCollected: null, upiCollected: null, cardCollected: null, fleetCardCollected: null,
  creditTotal: null, discrepancyAmount: null, discrepancyType: null, discrepancyReason: null,
  discrepancyResolution: null, discrepancyResolutionNote: null, cashRecoveryAmount: null,
  status: 'OPEN', isBackfilled: false, creditEntries: [],
}

async function fillShift(cash: string) {
  const user = userEvent.setup()
  renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
  await user.type(screen.getByPlaceholderText('Enter end reading'), '1010')
  await user.type(screen.getByLabelText('Cash (₹)'), cash)
  return user
}

describe('CloseShiftModal', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([])
    vi.mocked(shiftApi.closeShift).mockResolvedValue({} as never)
  })

  it('asks for readings and payment before it can close', () => {
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Close Shift' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill in readings & payment to continue' })).toBeDisabled()
  })

  it('keeps a neutral header until readings and payment are entered, then turns red for a shortage', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    const header = screen.getByRole('heading', { name: 'Close Shift' }).closest('.ui-modal-header')
    await user.type(screen.getByPlaceholderText('Enter end reading'), '1010')
    expect(header).toHaveClass('ui-modal-header--neutral')

    await user.type(screen.getByLabelText('Cash (₹)'), '900')
    expect(header).toHaveClass('ui-modal-header--danger')
  })

  it('asks inside the app before discarding entered details', async () => {
    const onClose = vi.fn()
    const browserConfirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={onClose} />)
    await user.type(screen.getByPlaceholderText('Enter end reading'), '1010')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog', { name: 'Discard what you entered?' })).toBeInTheDocument()
    expect(browserConfirm).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows Balanced and closes the shift when collection matches the meter', async () => {
    const user = await fillShift('1000')
    expect(screen.getByText('Balanced')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close Shift — Balanced' }))
    expect(shiftApi.closeShift).toHaveBeenCalledWith(3, 11, expect.objectContaining({
      fuelReadings: [{ nozzleId: 21, endReading: 1010 }],
      cashCollected: 1000,
      discrepancyReason: undefined,
    }))
  })

  it('shows Short and requires a reason, with no round off for a gap of a rupee or more', async () => {
    const user = await fillShift('900')
    expect(screen.getByText('SHORT ₹100.00')).toBeInTheDocument()
    expect(screen.getByText('Shift is SHORT by ₹100.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Round off/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a reason above to close' })).toBeDisabled()

    await user.type(screen.getByRole('textbox'), 'Customer paid later')
    await user.click(screen.getByRole('button', { name: 'Close with Discrepancy' }))
    expect(shiftApi.closeShift).toHaveBeenCalledWith(3, 11, expect.objectContaining({ discrepancyReason: 'Customer paid later' }))
  })

  it('rounds a gap under one rupee into cash so the shift balances', async () => {
    const user = await fillShift('999.40')
    expect(screen.getByText('Shift is SHORT by ₹0.60')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Round off ₹0.60 into cash' }))
    expect(screen.getByLabelText('Cash (₹)')).toHaveValue(1000)
    expect(within(screen.getByRole('dialog')).getByText('Balanced')).toBeInTheDocument()
  })

  it('shows Over when more was collected than due', async () => {
    await fillShift('1000.50')
    expect(screen.getByText('OVER ₹0.50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Round off ₹0.50 into cash' })).toBeInTheDocument()
  })

  it('corrects a pre-recorded credit entry by closing, without voiding it first', async () => {
    const user = userEvent.setup()
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([{
      id: 3, pumpId: 3, name: 'Acme', phone: null, notes: null, createdAt: '2026-01-01T00:00:00Z',
      parentClientId: null, parentClientName: null, isParent: false, isActive: true, hasPortalPin: false,
    }])
    const recordedEntry = {
      id: 41, clientId: 3, clientName: 'Acme', billNo: null, amount: 200, fuelType: 'PETROL',
      description: null, voidStatus: 'ACTIVE' as const, voidReason: null,
    }
    renderWithProviders(<CloseShiftModal shift={{ ...shift, creditEntries: [recordedEntry] }} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(screen.getByPlaceholderText('Enter end reading'), '1010')
    await user.type(screen.getByLabelText('Cash (₹)'), '800')
    await user.click(screen.getByRole('button', { name: 'Close Shift — Balanced' }))

    expect(shiftApi.voidCreditEntry).not.toHaveBeenCalled()
    expect(shiftApi.closeShift).toHaveBeenCalledWith(3, 11, expect.objectContaining({
      creditTotal: 200,
      replacedCreditEntryIds: [41],
      creditEntries: [expect.objectContaining({ clientId: 3, amount: 200 })],
    }))
  })
})
