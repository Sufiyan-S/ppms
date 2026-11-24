import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import { shiftApi } from '../../api/shiftApi'
import { userApi } from '../../api/userApi'
import type { StaffMember } from '../../api/userApi'
import type { PumpSummary } from '../../api/pumpApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../test/screenWidth'
import type { Shift } from '../../types/shift'
import CloseShiftModal from './CloseShiftModal'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn(), getMyPumps: vi.fn() } }))
vi.mock('../../api/shiftApi', () => ({
  shiftApi: { closeShift: vi.fn(), createHandover: vi.fn(), voidCreditEntry: vi.fn(), getShift: vi.fn() },
}))
vi.mock('../../api/userApi', () => ({ userApi: { getOperators: vi.fn() } }))

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
  discrepancyResolution: null, discrepancyResolutionNote: null,
  investigationNote: null, investigatedByName: null, investigationStartedAt: null, cashRecoveryAmount: null,
  status: 'OPEN', isBackfilled: false, creditEntries: [],
}

function operator(id: number, fullName: string): StaffMember {
  return {
    id, employeeId: `E${id}`, fullName, phoneNumber: null, gender: null, nightShiftConsent: false, role: 'OPERATOR',
    assignedPumpId: 3, status: 'ACTIVE', dailyRate: null, shift1HourlyRate: null, standardHourlyRate: null,
  }
}

const endReading = () => screen.getByLabelText('Nozzle #1 · Petrol end reading')

async function fillShift(cash: string) {
  const user = userEvent.setup()
  renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
  await user.type(endReading(), '1010')
  await user.type(screen.getByLabelText('Cash (₹)'), cash)
  return user
}

describe('CloseShiftModal', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([])
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([{ id: 3, discrepancyEscalationThreshold: 50 } as PumpSummary])
    vi.mocked(shiftApi.closeShift).mockResolvedValue({} as never)
    vi.mocked(shiftApi.getShift).mockResolvedValue(shift)
    vi.mocked(shiftApi.createHandover).mockResolvedValue({} as never)
    vi.mocked(userApi.getOperators).mockResolvedValue([operator(9, 'Ravi'), operator(12, 'Sita'), operator(13, 'Busy Bala')])
  })

  it('puts the cursor in the first end reading rather than the No change box', () => {
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    expect(endReading()).toHaveFocus()
  })

  it('fills cash with what is still due after UPI, card, fleet card and credit', async () => {
    const user = userEvent.setup()
    const recordedCredit = {
      id: 42, clientId: 3, clientName: 'Fleet Co', billNo: null, amount: 100, fuelType: 'PETROL',
      description: null, voidStatus: 'ACTIVE' as const, voidReason: null,
    }
    vi.mocked(shiftApi.getShift).mockResolvedValue({ ...shift, creditEntries: [recordedCredit] })
    renderWithProviders(<CloseShiftModal shift={{ ...shift, creditEntries: [recordedCredit] }} onClose={vi.fn()} />)

    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('UPI (₹)'), '300')
    await user.type(screen.getByLabelText('Card (₹)'), '50.50')
    await user.type(screen.getByLabelText('Fleet card (₹)'), '20')
    await user.click(screen.getByRole('button', { name: 'Fill rest · ₹529.50' }))

    expect(screen.getByLabelText('Cash (₹)')).toHaveValue(529.5)
    expect(within(screen.getByRole('dialog')).getByText('Balanced')).toBeInTheDocument()
  })

  it('offers Fill rest only while something is left to collect in cash', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Fill rest/ })).not.toBeInTheDocument()

    await user.type(endReading(), '1010')
    expect(screen.getByRole('button', { name: 'Fill rest · ₹1,000.00' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('UPI (₹)'), '1200')
    expect(screen.queryByRole('button', { name: /Fill rest/ })).not.toBeInTheDocument()
  })

  it('hides Fill rest once cash already holds the rest', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    await user.type(endReading(), '1010')
    await user.click(screen.getByRole('button', { name: 'Fill rest · ₹1,000.00' }))

    expect(screen.getByLabelText('Cash (₹)')).toHaveValue(1000)
    expect(screen.queryByRole('button', { name: /Fill rest/ })).not.toBeInTheDocument()
  })

  it('lists cash first among the payments', () => {
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    const payments = screen.getByRole('region', { name: 'Payments' })
    const paymentNames = within(payments).getAllByRole('spinbutton').map((input) => (input as HTMLInputElement).labels?.[0]?.textContent)
    expect(paymentNames).toEqual(['Cash (₹)', 'UPI (₹)', 'Card (₹)', 'Fleet card (₹)'])
  })

  it('shows the sale of each nozzle as the end reading is typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    expect(screen.getByText('Start 1,000 L · ₹100.00/L')).toBeInTheDocument()

    await user.type(endReading(), '1012.5')
    expect(screen.getByText(/= 12\.50 L × ₹100\.00 =/)).toHaveTextContent('= 12.50 L × ₹100.00 = ₹1,250.00')
    expect(endReading()).toHaveAccessibleDescription('= 12.50 L × ₹100.00 = ₹1,250.00')
  })

  it('explains an end reading below the start instead of a sale line', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    await user.type(endReading(), '990')

    expect(screen.getByRole('alert')).toHaveTextContent('End reading cannot be less than start (1000)')
    expect(endReading()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/× ₹100\.00/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review close' })).toHaveAccessibleDescription(/Fix end readings below the start/)
  })

  it('marks a nozzle unchanged with the light No change box', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    await user.click(screen.getByRole('checkbox', { name: 'No change' }))

    expect(endReading()).toBeDisabled()
    expect(endReading()).toHaveValue(1000)
    expect(screen.getByText('No change · 0 L sold')).toBeInTheDocument()
  })

  it('hands the shift over by closing it with the entered readings and payments for the chosen operator', async () => {
    const user = userEvent.setup()
    const busyShift = { ...shift, id: 99, operatorId: 13 }
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} handoverActiveShifts={[shift, busyShift]} />)

    expect(screen.getByRole('dialog', { name: 'Hand Over Shift' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Sita/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ravi/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Busy Bala/ })).not.toBeInTheDocument()
    expect(screen.getByText('Choose Incoming Operator')).toBeInTheDocument()
    expect(screen.queryByText('Assign Operator')).not.toBeInTheDocument()

    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('Cash (₹)'), '1000')
    const review = screen.getByRole('button', { name: 'Review handover' })
    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription('Still needed Choose the incoming operator')

    await user.click(screen.getByRole('button', { name: /Sita/ }))
    await user.click(screen.getByLabelText('Cash counted with the incoming operator'))
    await user.type(screen.getByLabelText('Handover notes (optional)'), 'Lunch break')
    await user.click(screen.getByRole('button', { name: 'Review handover' }))
    expect(screen.getByRole('heading', { name: 'Check before handing over' })).toHaveFocus()
    expect(within(screen.getByText('Incoming operator').parentElement as HTMLElement).getByText('Sita')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm handover' }))

    expect(shiftApi.closeShift).not.toHaveBeenCalled()
    expect(shiftApi.createHandover).toHaveBeenCalledWith(3, {
      outgoingShiftId: 11,
      incomingOperatorId: 12,
      physicalCashVerified: true,
      meterReadingsVerified: false,
      notes: 'Lunch break',
      closing: expect.objectContaining({
        fuelReadings: [{ nozzleId: 21, endReading: 1010 }],
        cashCollected: 1000,
      }),
    }, expect.any(String))
    expect(await screen.findByRole('heading', { name: 'Shift handed over' })).toBeInTheDocument()
    expect(screen.getByText('A new shift is open for Sita on the same nozzles.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open next shift' })).not.toBeInTheDocument()
  })

  it('shows a credit entry added while the modal is open and the reason a close is refused', async () => {
    const user = userEvent.setup()
    const addedMeanwhile = {
      id: 42, clientId: 3, clientName: 'Fleet Co', billNo: null, amount: 250, fuelType: 'PETROL',
      description: null, voidStatus: 'ACTIVE' as const, voidReason: null,
    }
    vi.mocked(shiftApi.getShift).mockResolvedValue({ ...shift, creditEntries: [addedMeanwhile] })
    vi.mocked(shiftApi.closeShift).mockRejectedValue(new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 400, statusText: 'Bad Request', headers: {}, config: { headers: new AxiosHeaders() },
      data: { message: 'Sum of all credit entries does not match the credit total.' },
    }))
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)

    expect(await screen.findByText('Fleet Co')).toBeInTheDocument()
    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('Cash (₹)'), '750')
    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))

    expect(shiftApi.closeShift).toHaveBeenCalledWith(3, 11, expect.objectContaining({ creditTotal: 250 }), expect.any(String))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sum of all credit entries does not match the credit total.')
  })

  it('lists what is still needed and points the disabled Review button at that list', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Close Shift' })).toBeInTheDocument()
    const review = screen.getByRole('button', { name: 'Review close' })
    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription('Still needed End reading for 1 nozzle Payments collected')

    await user.type(endReading(), '1010')
    expect(review).toHaveAccessibleDescription('Still needed Payments collected')

    await user.type(screen.getByLabelText('Cash (₹)'), '1000')
    expect(review).toBeEnabled()
    expect(review).not.toHaveAttribute('aria-describedby')
    expect(screen.queryByText('Still needed')).not.toBeInTheDocument()
  })

  it('asks to finish an incomplete credit entry before review', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('Cash (₹)'), '1000')
    await user.click(screen.getByRole('button', { name: 'Add credit sale' }))

    expect(screen.getByRole('button', { name: 'Review close' })).toBeDisabled()
    expect(screen.getByText('Finish 1 credit entry')).toBeInTheDocument()
    expect(container.querySelector('.bg-warn-bg')).toBeNull()
  })

  it('keeps the success header until readings and payment are entered, then turns red for a shortage', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    const header = screen.getByRole('heading', { name: 'Close Shift' }).closest('.ui-modal-header')
    expect(header).toHaveClass('ui-modal-header--success')
    await user.type(endReading(), '1010')
    expect(header).toHaveClass('ui-modal-header--success')

    await user.type(screen.getByLabelText('Cash (₹)'), '900')
    expect(header).toHaveClass('ui-modal-header--danger')
  })

  it('asks inside the app before discarding entered details', async () => {
    const onClose = vi.fn()
    const browserConfirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={onClose} />)
    await user.type(endReading(), '1010')

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

    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))
    expect(shiftApi.closeShift).toHaveBeenCalledWith(3, 11, expect.objectContaining({
      fuelReadings: [{ nozzleId: 21, endReading: 1010 }],
      cashCollected: 1000,
      discrepancyReason: undefined,
    }), expect.any(String))
    expect(await screen.findByRole('heading', { name: 'Shift closed' })).toBeInTheDocument()
  })

  it('shows Short and requires a reason, with no round off for a gap of a rupee or more', async () => {
    const user = await fillShift('900')
    expect(screen.getByText('Short ₹100.00')).toBeInTheDocument()
    expect(screen.getByText('Shift is short by ₹100.00')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Round off/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review close' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Review close' })).toHaveAccessibleDescription('Still needed Reason for the difference')

    await user.type(screen.getByRole('textbox'), 'Customer paid later')
    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))
    expect(shiftApi.closeShift).toHaveBeenCalledWith(3, 11, expect.objectContaining({ discrepancyReason: 'Customer paid later' }), expect.any(String))
  })

  it('rounds a gap under one rupee into cash so the shift balances', async () => {
    const user = await fillShift('999.40')
    expect(screen.getByText('Shift is short by ₹0.60')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Round off ₹0.60 into cash' }))
    expect(screen.getByLabelText('Cash (₹)')).toHaveValue(1000)
    expect(within(screen.getByRole('dialog')).getByText('Balanced')).toBeInTheDocument()
  })

  it('shows Over when more was collected than due', async () => {
    await fillShift('1000.50')
    expect(screen.getByText('Over ₹0.50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Round off ₹0.50 into cash' })).toBeInTheDocument()
  })

  it('corrects a pre-recorded credit entry by closing, without voiding it first', async () => {
    const user = userEvent.setup()
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([{
      id: 3, pumpId: 3, name: 'Acme', phone: null,
      parentClientId: null, parentClientName: null, isParent: false, isActive: true,
    }])
    const recordedEntry = {
      id: 41, clientId: 3, clientName: 'Acme', billNo: null, amount: 200, fuelType: 'PETROL',
      description: null, voidStatus: 'ACTIVE' as const, voidReason: null,
    }
    vi.mocked(shiftApi.getShift).mockResolvedValue({ ...shift, creditEntries: [recordedEntry] })
    renderWithProviders(<CloseShiftModal shift={{ ...shift, creditEntries: [recordedEntry] }} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('Cash (₹)'), '800')
    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))

    expect(shiftApi.voidCreditEntry).not.toHaveBeenCalled()
    expect(shiftApi.closeShift).toHaveBeenCalledWith(3, 11, expect.objectContaining({
      creditTotal: 200,
      replacedCreditEntryIds: [41],
      creditEntries: [expect.objectContaining({ clientId: 3, amount: 200 })],
    }), expect.any(String))
  })

  it('reviews every figure before closing and goes back to the form on Edit', async () => {
    const user = await fillShift('900')
    await user.type(screen.getByRole('textbox'), 'Customer paid later')
    await user.click(screen.getByRole('button', { name: 'Review close' }))

    const review = screen.getByRole('dialog', { name: 'Check before closing' })
    expect(screen.getByRole('heading', { name: 'Check before closing' })).toHaveFocus()
    expect(within(review).getByRole('row', { name: /Nozzle #1 · Petrol/ })).toHaveTextContent('10.00 L₹1,000.00')
    expect(within(review).getByRole('row', { name: /Total due/ })).toHaveTextContent('₹1,000.00')
    expect(within(review).getByText('Cash').nextSibling).toHaveTextContent('₹900.00')
    expect(within(review).getByText('Credit (0 entries)')).toBeInTheDocument()
    expect(within(review).getByText('Short ₹100.00')).toBeInTheDocument()
    expect(within(review).getByText('Reason: Customer paid later')).toBeInTheDocument()
    expect(await within(review).findByText(/more than the ₹50.00 limit/)).toBeInTheDocument()
    expect(review.querySelector('.ui-modal-backdrop')).toHaveClass('ui-modal-backdrop--fullscreen')
    expect(within(review).getByRole('button', { name: 'Confirm close' }).parentElement).toHaveClass('ui-modal-footer--large')

    await user.click(within(review).getByRole('button', { name: 'Edit' }))
    expect(shiftApi.closeShift).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Cash (₹)')).toHaveValue(900)
    expect(screen.getByRole('dialog', { name: 'Close Shift' }).querySelector('.ui-modal-backdrop'))
      .not.toHaveClass('ui-modal-backdrop--fullscreen')
  })

  it('after closing shows one summary instead of a toast, and offers the next shift, print and done', async () => {
    const onClose = vi.fn()
    const onOpenNextShift = vi.fn()
    const closed = { ...shift, status: 'CLOSED_BALANCED' as const, actualEndTime: '2026-03-15T08:30:00Z', totalAmountDue: 1000 }
    vi.mocked(shiftApi.closeShift).mockResolvedValue(closed)
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={onClose} onOpenNextShift={onOpenNextShift} />)
    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('Cash (₹)'), '1000')
    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))

    const summary = await screen.findByRole('dialog', { name: 'Shift closed' })
    expect(within(summary).getByText('Balanced')).toBeInTheDocument()
    expect(within(summary).getByText('Total due').nextSibling).toHaveTextContent('₹1,000.00')
    expect(within(summary).getByText('Credit entries').nextSibling).toHaveTextContent('0')

    await user.click(within(summary).getByRole('button', { name: 'Print / share' }))
    const report = await screen.findByRole('dialog', { name: 'Shift handover report' })
    await user.click(within(report).getByRole('button', { name: 'Close' }))

    await user.click(await screen.findByRole('button', { name: 'Open next shift' }))
    expect(onOpenNextShift).toHaveBeenCalledWith(5, [21])

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('reuses the same idempotency key when the close is resent after a timeout, even after a reload', async () => {
    const timeout = new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED')
    vi.mocked(shiftApi.closeShift).mockRejectedValueOnce(timeout).mockRejectedValueOnce(timeout)
    const first = await fillShift('1000')
    await first.click(screen.getByRole('button', { name: 'Review close' }))
    await first.click(screen.getByRole('button', { name: 'Confirm close' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Server didn't respond")

    await first.click(screen.getByRole('button', { name: 'Confirm close' }))
    await waitFor(() => expect(shiftApi.closeShift).toHaveBeenCalledTimes(2))
    const firstKey = vi.mocked(shiftApi.closeShift).mock.calls[0][3]
    expect(firstKey).toMatch(/^[0-9a-f]{32}$/)
    expect(vi.mocked(shiftApi.closeShift).mock.calls[1][3]).toBe(firstKey)

    cleanup()
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))
    await waitFor(() => expect(shiftApi.closeShift).toHaveBeenCalledTimes(3))
    expect(vi.mocked(shiftApi.closeShift).mock.calls[2][3]).toBe(firstKey)
  })

  it('sends a new key once the figures change after a failed attempt', async () => {
    vi.mocked(shiftApi.closeShift).mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))
    const user = await fillShift('1000')
    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.type(screen.getByLabelText('UPI (₹)'), '100')
    await user.clear(screen.getByLabelText('Cash (₹)'))
    await user.type(screen.getByLabelText('Cash (₹)'), '900')
    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))

    await waitFor(() => expect(shiftApi.closeShift).toHaveBeenCalledTimes(2))
    const [firstCall, secondCall] = vi.mocked(shiftApi.closeShift).mock.calls
    expect(secondCall[3]).not.toBe(firstCall[3])
  })
})

describe('CloseShiftModal live summary', () => {
  resetScreenWidthAfterEach()

  beforeEach(() => {
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([])
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([{ id: 3, discrepancyEscalationThreshold: 50 } as PumpSummary])
    vi.mocked(shiftApi.getShift).mockResolvedValue(shift)
  })

  it('sits beside the form on a wide screen and shows a dash until there is something to add up', async () => {
    setScreenWidth(1280)
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)

    const summary = screen.getByRole('complementary', { name: 'Summary' })
    expect(within(summary).getByText('Total due').nextSibling).toHaveTextContent('—')
    expect(within(summary).getByText('Collected').nextSibling).toHaveTextContent('—')
    expect(within(summary).getByText('Difference').nextSibling).toHaveTextContent('—')
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument()

    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('UPI (₹)'), '300')
    await user.type(screen.getByLabelText('Cash (₹)'), '600')

    expect(within(summary).getByText('Sold').nextSibling).toHaveTextContent('10.00 L')
    expect(within(summary).getByText('Total due').nextSibling).toHaveTextContent('₹1,000.00')
    expect(within(summary).getByText('Collected').nextSibling).toHaveTextContent('₹900.00')
    expect(within(summary).getByText('UPI').nextSibling).toHaveTextContent('₹300.00')
    expect(within(summary).getByText('Short ₹100.00')).toBeInTheDocument()
    expect(within(summary).getByText(/more than the ₹50.00 limit/)).toBeInTheDocument()
    expect(within(summary).getByText('Reason for the difference')).toBeInTheDocument()
  })

  it('shows Over and then Balanced in the summary as cash changes', async () => {
    setScreenWidth(1280)
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)
    const summary = screen.getByRole('complementary', { name: 'Summary' })

    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('Cash (₹)'), '1020')
    expect(within(summary).getByText('Over ₹20.00')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Cash (₹)'))
    await user.type(screen.getByLabelText('Cash (₹)'), '1000')
    expect(within(summary).getByText('Balanced')).toBeInTheDocument()
    expect(within(summary).getByText('Ready to review')).toBeInTheDocument()
  })

  it('becomes a compact bar above the buttons on a phone, with the breakdown behind Details', async () => {
    setScreenWidth(375)
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)

    expect(screen.queryByRole('complementary', { name: 'Summary' })).not.toBeInTheDocument()
    const bar = screen.getByRole('region', { name: 'Summary' })
    expect(bar.closest('.ui-modal-footer')).not.toBeNull()
    expect(within(bar).getByText('Due').nextSibling).toHaveTextContent('—')

    await user.type(endReading(), '1010')
    await user.type(screen.getByLabelText('Cash (₹)'), '900')
    expect(within(bar).getByText('Due').nextSibling).toHaveTextContent('₹1,000.00')
    expect(within(bar).getByText('Short ₹100.00')).toBeInTheDocument()

    const details = within(bar).getByRole('button', { name: 'Details' })
    expect(details).toHaveAttribute('aria-expanded', 'false')
    expect(within(bar).getByText('Sold')).not.toBeVisible()

    await user.click(details)
    expect(within(bar).getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(bar).getByText('Sold')).toBeVisible()
  })
})

describe('CloseShiftModal drafts', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([])
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([])
    vi.mocked(shiftApi.getShift).mockResolvedValue(shift)
    vi.mocked(userApi.getOperators).mockResolvedValue([operator(12, 'Sita')])
  })

  it('saves entries on this device shortly after typing, separately for close and handover', async () => {
    await fillShift('900')

    await waitFor(() => expect(localStorage.getItem('ppms_draft:close-shift:11')).not.toBeNull())
    const saved = JSON.parse(localStorage.getItem('ppms_draft:close-shift:11') as string)
    expect(saved.values).toMatchObject({ endReadings: { 21: '1010' }, cash: '900' })
    expect(localStorage.getItem('ppms_draft:handover:11')).toBeNull()
  })

  it('restores saved entries with a notice and clears them on Discard', async () => {
    localStorage.setItem('ppms_draft:close-shift:11', JSON.stringify({
      savedAt: Date.now() - 60_000,
      values: {
        endReadings: { 21: '1010' }, noChangeNozzleIds: [], cash: '700', upi: '', card: '', fleetCard: '',
        discrepancyReason: '',
        handoverDetails: { incomingOperatorId: null, physicalCashVerified: false, meterReadingsVerified: false, notes: '' },
        creditRows: [], submitAttempt: null,
      },
    }))
    const user = userEvent.setup()
    renderWithProviders(<CloseShiftModal shift={shift} onClose={vi.fn()} />)

    expect(screen.getByText(/^Resumed your unsaved entries from \d{2}:\d{2} (am|pm)$/i)).toBeInTheDocument()
    expect(endReading()).toHaveValue(1010)
    expect(screen.getByLabelText('Cash (₹)')).toHaveValue(700)

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText(/Resumed your unsaved entries/)).not.toBeInTheDocument()
    expect(endReading()).toHaveValue(null)
    expect(screen.getByLabelText('Cash (₹)')).toHaveValue(null)
    expect(localStorage.getItem('ppms_draft:close-shift:11')).toBeNull()
  })

  it('clears the draft once the shift is closed', async () => {
    vi.mocked(shiftApi.closeShift).mockResolvedValue({ ...shift, status: 'CLOSED_BALANCED' })
    const user = await fillShift('1000')
    await waitFor(() => expect(localStorage.getItem('ppms_draft:close-shift:11')).not.toBeNull())

    await user.click(screen.getByRole('button', { name: 'Review close' }))
    await user.click(screen.getByRole('button', { name: 'Confirm close' }))
    await screen.findByRole('heading', { name: 'Shift closed' })

    expect(localStorage.getItem('ppms_draft:close-shift:11')).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(localStorage.getItem('ppms_draft:close-shift:11')).toBeNull()
  })

  it('still works when the browser refuses storage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })

    await fillShift('1000')

    expect(screen.getByText('Balanced')).toBeInTheDocument()
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not save the draft'), expect.any(Error)))
    setItem.mockRestore()
    warn.mockRestore()
  })
})
