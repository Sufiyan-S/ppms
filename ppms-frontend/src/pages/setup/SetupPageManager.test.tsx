import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import SetupPage from './SetupPage'

vi.mock('../../api/pumpApi', () => ({
  pumpApi: { getMyPumps: vi.fn(), getSetupChecklist: vi.fn(), getCurrentPrices: vi.fn(), setFuelPrice: vi.fn() },
}))

const pump: PumpSummary = {
  id: 3, name: 'Highway Pump', address: 'NH 48', maxDuCount: 4, ownerId: 1, createdAt: '2026-01-01T00:00:00Z',
  discrepancyEscalationThreshold: null, expenseApprovalThreshold: null,
  dus: [{
    id: 1, pumpId: 3, duNumber: 1, name: 'DU-1', status: 'ACTIVE',
    nozzles: [{ id: 1, nozzleNumber: 1, fuelType: 'DIESEL', lastReading: 0, maxMeterValue: 99_999, tankId: null, status: 'ACTIVE' }],
  }],
}

describe('SetupPage for a manager', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 2, fullName: 'Manager', role: 'MANAGER', assignedPumpId: 3 }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 3 })
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([pump])
    vi.mocked(pumpApi.getCurrentPrices).mockResolvedValue([
      { id: 1, pumpId: 3, fuelType: 'DIESEL', pricePerUnit: 90, effectiveFrom: new Date().toISOString(), setByUserId: 1 },
    ])
    vi.mocked(pumpApi.setFuelPrice).mockResolvedValue({ openShiftsWarning: null } as never)
  })

  it('shows the fuel price cards and lets the manager save a new price', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SetupPage />, { route: '/dashboard/setup' })

    const diesel = await screen.findByRole('article', { name: 'Diesel' })
    expect(await within(diesel).findByText('₹90.00')).toBeInTheDocument()

    const input = within(diesel).getByRole('spinbutton', { name: 'New price (Diesel)' })
    await user.type(input, '91.25')
    expect(input).toHaveAccessibleDescription('Up ₹1.25 (+1.4%) from ₹90.00')

    await user.click(screen.getByRole('button', { name: 'Save prices' }))
    expect(vi.mocked(pumpApi.setFuelPrice).mock.calls[0][0]).toEqual({ pumpId: 3, fuelType: 'DIESEL', pricePerUnit: 91.25 })
    expect(pumpApi.getSetupChecklist).not.toHaveBeenCalled()
  })
})
