import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../api/shiftApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { Shift } from '../../types/shift'
import type { UserRole } from '../../types/auth'
import ShiftsPage from './ShiftsPage'

vi.mock('../../api/shiftApi', () => ({
  shiftApi: {
    getActiveShifts: vi.fn(),
    getShiftHistory: vi.fn().mockResolvedValue([]),
    voidCreditEntry: vi.fn(),
    addCreditEntry: vi.fn(),
  },
}))
vi.mock('../../api/pumpApi', () => ({
  pumpApi: { getMyPumps: vi.fn().mockResolvedValue([]), getCreditClients: vi.fn().mockResolvedValue([]) },
}))

const PUMP_ID = 4

function openShift(entryStatus: 'ACTIVE' | 'VOIDED'): Shift {
  return {
    id: 90, pumpId: PUMP_ID, duId: 1, duNumber: 1, duName: 'DU 1', nozzles: [{ nozzleId: 3, nozzleNumber: 1, fuelType: 'PETROL' }],
    operatorId: 8, operatorName: 'Asha', openedByUserName: 'Mgr', shiftWindow: 'Day', shiftDate: '2026-11-20',
    actualStartTime: '2026-11-20T03:30:00Z', actualEndTime: null, scheduledEndTime: null,
    fuelReadings: [{ fuelType: 'PETROL', priceSnapshot: 100 }], totalAmountDue: null, cashCollected: null, upiCollected: null,
    cardCollected: null, fleetCardCollected: null, creditTotal: null, discrepancyAmount: null, discrepancyType: null,
    discrepancyReason: null, discrepancyResolution: null, discrepancyResolutionNote: null, cashRecoveryAmount: null,
    status: 'OPEN', isBackfilled: false,
    creditEntries: [{ id: 501, clientId: 2, clientName: 'Acme', billNo: null, amount: 500, fuelType: 'PETROL', description: null, voidStatus: entryStatus, voidReason: null }],
  } as unknown as Shift
}

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: PUMP_ID }, isAuthenticated: true })
}

describe('ShiftsPage', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: PUMP_ID })
    vi.mocked(shiftApi.getActiveShifts).mockResolvedValue([openShift('ACTIVE')])
  })

  it('hides Open Shift, Close and Void from an operator, who may only add credit', async () => {
    signIn('OPERATOR')
    const user = userEvent.setup()
    renderWithProviders(<ShiftsPage />)

    const row = (await screen.findByText('Asha')).closest('tr')!
    expect(screen.queryByRole('button', { name: /Open Shift/ })).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: /Credit/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Acme')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Void' })).not.toBeInTheDocument()
  })

  it('shows Open Shift and Close to a manager', async () => {
    signIn('MANAGER')
    renderWithProviders(<ShiftsPage />)
    const row = (await screen.findByText('Asha')).closest('tr')!
    expect(screen.getByRole('button', { name: /Open Shift/ })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('shows a voided entry as voided in the open credit dialog once active shifts refresh', async () => {
    signIn('MANAGER')
    const user = userEvent.setup()
    const { queryClient } = renderWithProviders(<ShiftsPage />)

    const row = (await screen.findByText('Asha')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: /Credit/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Void' })).toBeInTheDocument()

    vi.mocked(shiftApi.getActiveShifts).mockResolvedValue([openShift('VOIDED')])
    await queryClient.invalidateQueries({ queryKey: ['activeShifts', PUMP_ID] })

    await vi.waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Void' })).not.toBeInTheDocument())
    expect(within(dialog).getByText(/VOIDED/)).toBeInTheDocument()
  })
})
