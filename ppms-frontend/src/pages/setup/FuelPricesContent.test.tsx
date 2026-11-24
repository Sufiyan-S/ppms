import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { FuelPrice, PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'
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

const petrolSetOn = (effectiveFrom: string): FuelPrice =>
  ({ id: 1, pumpId: 3, fuelType: 'PETROL', pricePerUnit: 100, effectiveFrom, setByUserId: 1 })
const currentPrices = [petrolSetOn(new Date().toISOString())]

function largeJumpRefusal() {
  const data = { message: 'Price moved 20% from the last price', lastPrice: 100, newPrice: 120, deviationPercent: 20 }
  return new AxiosError('Conflict', 'ERR', undefined, undefined, {
    status: 409, statusText: '', data, headers: {}, config: { headers: new AxiosHeaders() },
  })
}

describe('FuelPricesContent', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.setFuelPrice).mockReset()
    vi.mocked(pumpApi.setFuelPrice).mockResolvedValue({ openShiftsWarning: null } as never)
    useToastStore.setState({ toasts: [] })
  })

  it('shows each fuel as a card with its current price', () => {
    renderWithProviders(<FuelPricesContent pump={pump} currentPrices={currentPrices} />)

    const petrol = screen.getByRole('article', { name: 'Petrol' })
    expect(within(petrol).getByText('₹100.00')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Diesel' })).getByText('Not set')).toBeInTheDocument()
  })

  it('says in words how far a higher price moves from the current one', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FuelPricesContent pump={pump} currentPrices={currentPrices} />)

    const petrol = screen.getByRole('spinbutton', { name: 'New price (Petrol)' })
    expect(petrol).toHaveAccessibleDescription('Leave blank to keep ₹100.00')

    await user.type(petrol, '101.5')

    expect(petrol).toHaveAccessibleDescription('Up ₹1.50 (+1.5%) from ₹100.00')
    expect(screen.getByRole('spinbutton', { name: 'New price (Diesel)' })).toHaveAccessibleDescription('No price set yet')
  })

  it('says in words how far a lower or unchanged price moves', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FuelPricesContent pump={pump} currentPrices={currentPrices} />)
    const petrol = screen.getByRole('spinbutton', { name: 'New price (Petrol)' })

    await user.type(petrol, '98')
    expect(petrol).toHaveAccessibleDescription('Down ₹2.00 (−2.0%) from ₹100.00')

    await user.clear(petrol)
    await user.type(petrol, '100')
    expect(petrol).toHaveAccessibleDescription('Same as the current ₹100.00')
  })

  it('keeps Save prices off and says why until a price is typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<FuelPricesContent pump={pump} currentPrices={currentPrices} />)

    const save = screen.getByRole('button', { name: 'Save prices' })
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription(/A new price for at least one fuel/)

    await user.type(screen.getByRole('spinbutton', { name: 'New price (Diesel)' }), '90')
    expect(save).toBeEnabled()
    await user.click(save)

    expect(vi.mocked(pumpApi.setFuelPrice).mock.calls[0][0]).toEqual({ pumpId: 3, fuelType: 'DIESEL', pricePerUnit: 90 })
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Fuel prices updated')
  })

  it('asks before saving a large jump, and saves it once confirmed', async () => {
    const user = userEvent.setup()
    vi.mocked(pumpApi.setFuelPrice).mockRejectedValueOnce(largeJumpRefusal())
    renderWithProviders(<FuelPricesContent pump={pump} currentPrices={currentPrices} />)

    await user.type(screen.getByRole('spinbutton', { name: 'New price (Petrol)' }), '120')
    await user.click(screen.getByRole('button', { name: 'Save prices' }))

    const dialog = await screen.findByRole('dialog', { name: /Large price change/ })
    expect(within(dialog).getByText('Price moved 20% from the last price')).toBeInTheDocument()
    expect(within(dialog).getByText(/\+20\.0%/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Set new price' }))

    expect(vi.mocked(pumpApi.setFuelPrice).mock.lastCall?.[0]).toEqual({ pumpId: 3, fuelType: 'PETROL', pricePerUnit: 120, confirmed: true })
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Fuel prices updated')
  })

  it('keeps yesterday’s prices with one tap when they were not updated today', async () => {
    const user = userEvent.setup()
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    renderWithProviders(<FuelPricesContent pump={pump} currentPrices={[petrolSetOn(yesterday)]} />)

    expect(screen.getByText('Fuel prices not updated today')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Same prices' }))

    expect(vi.mocked(pumpApi.setFuelPrice).mock.calls[0][0]).toEqual({ pumpId: 3, fuelType: 'PETROL', pricePerUnit: 100 })
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain('Prices confirmed for today')
    expect(screen.queryByText('Fuel prices not updated today')).not.toBeInTheDocument()
  })
})
