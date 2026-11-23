import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { FuelPrice, PumpSummary } from '../../api/pumpApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { FuelPricesContent } from './FuelPricesContent'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { setFuelPrice: vi.fn() } }))

const pump = {
  id: 3, name: 'Pump 3', address: 'Pune', maxDuCount: 4, ownerId: 1, createdAt: '2026-01-01T00:00:00Z',
  discrepancyEscalationThreshold: null, expenseApprovalThreshold: null,
  dus: [{
    id: 1, pumpId: 3, duNumber: 1, name: 'DU-1', status: 'ACTIVE',
    nozzles: [
      { id: 11, nozzleNumber: 1, fuelType: 'PETROL', lastReading: 0, maxMeterValue: 99_999, tankId: null, status: 'ACTIVE' },
      { id: 12, nozzleNumber: 2, fuelType: 'DIESEL', lastReading: 0, maxMeterValue: 99_999, tankId: null, status: 'ACTIVE' },
    ],
  }],
} as PumpSummary

const currentPrices: FuelPrice[] = [
  { id: 1, pumpId: 3, fuelType: 'PETROL', pricePerUnit: 100, effectiveFrom: new Date().toISOString(), setByUserId: 1 },
]

describe('FuelPricesContent', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.setFuelPrice).mockResolvedValue({ openShiftsWarning: null } as never)
  })

  it('shows the change from the current price as the new price is typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FuelPricesContent pump={pump} currentPrices={currentPrices} />)

    const petrol = screen.getByRole('spinbutton', { name: 'Petrol' })
    expect(petrol).toHaveAccessibleDescription('Current price ₹100.00/L')

    await user.type(petrol, '101.5')

    expect(petrol).toHaveAccessibleDescription('Current price ₹100.00/L · change +₹1.50 (+1.5%)')
    expect(screen.getByRole('spinbutton', { name: 'Diesel' })).toHaveAccessibleDescription('No price set yet')
  })

  it('keeps Save prices off and says why until a price is typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FuelPricesContent pump={pump} currentPrices={currentPrices} />)

    const save = screen.getByRole('button', { name: 'Save prices' })
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription(/A new price for at least one fuel/)

    await user.type(screen.getByRole('spinbutton', { name: 'Diesel' }), '90')
    expect(save).toBeEnabled()
    await user.click(save)

    expect(vi.mocked(pumpApi.setFuelPrice).mock.calls[0][0]).toEqual({ pumpId: 3, fuelType: 'DIESEL', pricePerUnit: 90 })
  })
})
