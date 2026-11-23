import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { AxiosError } from 'axios'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../../api/pumpApi'
import type { CreditClient } from '../../../api/pumpApi'
import { shiftApi } from '../../../api/shiftApi'
import { useAuthStore } from '../../../store/authStore'
import { useToastStore } from '../../../store/toastStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { Shift } from '../../../types/shift'
import { AddCreditEntryModal } from './AddCreditEntryModal'

vi.mock('../../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn(), getCreditStanding: vi.fn() } }))
vi.mock('../../../api/shiftApi', () => ({ shiftApi: { addCreditEntry: vi.fn(), voidCreditEntry: vi.fn() } }))

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

const fleetClient: CreditClient = {
  id: 40, pumpId: 3, name: 'Fleet Co', phone: null, notes: null, createdAt: '2026-01-01T00:00:00Z',
  parentClientId: null, parentClientName: null, isParent: false, isActive: true, hasPortalPin: false,
} as CreditClient

describe('AddCreditEntryModal', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 9, fullName: 'Ravi', role: 'OPERATOR', assignedPumpId: 3 }, isAuthenticated: true })
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([fleetClient])
    vi.mocked(pumpApi.getCreditStanding).mockResolvedValue([{ clientId: 40, creditStatus: 'OK', availableCredit: 1000 }])
    vi.mocked(shiftApi.addCreditEntry).mockResolvedValue({} as never)
    useToastStore.setState({ toasts: [] })
  })

  it('cannot save credit for a typed name that is not a client and saves once a client is picked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddCreditEntryModal shift={shift} onClose={vi.fn()} />)

    const search = screen.getByPlaceholderText('Search client name…')
    await user.type(search, 'Fleet')
    await user.type(screen.getByLabelText('Amount'), '250')
    expect(screen.getByRole('button', { name: 'Save credit sale' })).toBeDisabled()

    await user.click(search)
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Fleet Co/ }))
    await user.click(screen.getByRole('button', { name: 'Save credit sale' }))

    expect(shiftApi.addCreditEntry).toHaveBeenCalledWith(3, 11, expect.objectContaining({ clientId: 40, clientName: 'Fleet Co', amount: 250 }), expect.any(String))
    await waitFor(() => expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ message: 'Credit of ₹250.00 added for Fleet Co', variant: 'success' }),
    ]))
  })

  it('keeps the entry on this device, restores it on reopen and resends with the same key after a timeout', async () => {
    vi.mocked(shiftApi.addCreditEntry).mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))
    const first = userEvent.setup()
    renderWithProviders(<AddCreditEntryModal shift={shift} onClose={vi.fn()} />)
    await first.type(screen.getByPlaceholderText('Search client name…'), 'Fleet')
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Fleet Co/ }))
    await first.type(screen.getByLabelText('Amount'), '250')
    await first.type(screen.getByLabelText('Bill no. (optional)'), 'B-9')
    await first.click(screen.getByRole('button', { name: 'Save credit sale' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Server didn't respond")
    const firstKey = vi.mocked(shiftApi.addCreditEntry).mock.calls[0][3]

    cleanup()
    const user = userEvent.setup()
    renderWithProviders(<AddCreditEntryModal shift={shift} onClose={vi.fn()} />)
    expect(screen.getByText(/^Resumed your unsaved entries from/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search client name…')).toHaveValue('Fleet Co')
    expect(screen.getByLabelText('Amount')).toHaveValue(250)
    expect(screen.getByLabelText('Bill no. (optional)')).toHaveValue('B-9')

    await user.click(screen.getByRole('button', { name: 'Save credit sale' }))
    await waitFor(() => expect(shiftApi.addCreditEntry).toHaveBeenCalledTimes(2))
    expect(vi.mocked(shiftApi.addCreditEntry).mock.calls[1][3]).toBe(firstKey)
    await waitFor(() => expect(localStorage.getItem('ppms_draft:credit-entry:11')).toBeNull())
  })

  it('discards restored entries back to an empty form', async () => {
    localStorage.setItem('ppms_draft:credit-entry:11', JSON.stringify({
      savedAt: Date.now(),
      values: {
        clientSearch: 'Fleet Co', clientName: 'Fleet Co', clientId: 40, subAccountId: null, fuelType: 'PETROL',
        amount: '300', liters: '', inputMode: 'amount', billNo: '', description: '', submitAttempt: null,
      },
    }))
    const user = userEvent.setup()
    renderWithProviders(<AddCreditEntryModal shift={shift} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(screen.getByPlaceholderText('Search client name…')).toHaveValue('')
    expect(screen.getByLabelText('Amount')).toHaveValue(null)
    expect(screen.getByRole('button', { name: 'Save credit sale' })).toBeDisabled()
    expect(localStorage.getItem('ppms_draft:credit-entry:11')).toBeNull()
  })

  it('says what is still needed and works out litres and the credit left as the amount is typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddCreditEntryModal shift={shift} onClose={vi.fn()} />)

    const save = screen.getByRole('button', { name: 'Save credit sale' })
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription('Still needed Client from the list Amount')

    await user.type(screen.getByPlaceholderText('Search client name…'), 'Fleet')
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Fleet Co/ }))
    expect(save).toHaveAccessibleDescription('Still needed Amount')

    await user.type(screen.getByLabelText('Amount'), '250')
    expect(screen.getByLabelText('Amount')).toHaveAccessibleDescription('2.50 L × ₹100.00 = ₹250.00')
    expect(await screen.findByText('Credit available')).toBeInTheDocument()
    expect(screen.getByText('Credit available').nextSibling).toHaveTextContent('₹1,000.00')
    expect(screen.getByText('Left after this sale').nextSibling).toHaveTextContent('₹750.00')
    expect(save).toBeEnabled()
  })

  it('works out the amount from litres at the shift price', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddCreditEntryModal shift={shift} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Enter quantity' }))
    await user.type(screen.getByLabelText('Quantity'), '3.5')

    expect(screen.getByLabelText('Quantity')).toHaveAccessibleDescription('3.50 L × ₹100.00 = ₹350.00')
  })
})
