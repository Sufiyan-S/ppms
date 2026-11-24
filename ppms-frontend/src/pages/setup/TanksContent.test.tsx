import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock } from '../../api/inventoryApi'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary, TankInfo } from '../../api/pumpApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { TanksContent } from './TanksContent'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { getTanks: vi.fn(), createTank: vi.fn(), updateTankStatus: vi.fn() } }))
vi.mock('../../api/inventoryApi', () => ({ inventoryApi: { getTankStocks: vi.fn(), getDipChecks: vi.fn() } }))

const nozzle = (id: number, tankId: number | null) =>
  ({ id, nozzleNumber: id, fuelType: 'PETROL' as const, lastReading: 0, maxMeterValue: 99999, tankId, status: 'ACTIVE' })

const pump = {
  id: 3,
  dus: [{ id: 1, pumpId: 3, duNumber: 1, name: 'DU-1', status: 'ACTIVE', nozzles: [nozzle(1, 11), nozzle(2, 11)] }],
} as unknown as PumpSummary

const tank = (id: number, tankIdentifier: string, currentStock: number, fuelType: TankInfo['fuelType'] = 'PETROL'): TankInfo =>
  ({ id, pumpId: 3, tankIdentifier, fuelType, capacity: 20000, currentStock, dipTolerance: 0, status: 'ACTIVE', createdAt: '' })

const stock = (tankId: number, lowStock: boolean) => ({ tankId, lowStock }) as TankStock

describe('TanksContent', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getTanks).mockResolvedValue([])
    vi.mocked(pumpApi.createTank).mockResolvedValue({} as never)
    vi.mocked(pumpApi.updateTankStatus).mockResolvedValue({} as never)
    vi.mocked(inventoryApi.getTankStocks).mockResolvedValue([])
    vi.mocked(inventoryApi.getDipChecks).mockResolvedValue({ content: [] } as never)
  })

  it('keeps Add tank off and lists what is missing until name and capacity are in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TanksContent pump={pump} />)

    const add = await screen.findByRole('button', { name: 'Add tank' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription(/Tank name or ID.*Capacity/)

    await user.type(screen.getByLabelText('Tank name or ID'), 'T1')
    await user.type(screen.getByRole('spinbutton', { name: 'Capacity' }), '20000')

    expect(screen.getByText('Holds 20,000 L when full')).toBeInTheDocument()
    expect(add).toBeEnabled()
    await user.click(add)

    expect(pumpApi.createTank).toHaveBeenCalledWith(3, { tankIdentifier: 'T1', fuelType: 'PETROL', capacity: 20000, dipTolerance: undefined })
  })

  it('offers to add the first tank when there are none, taking the owner to the name field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TanksContent pump={pump} />)

    expect(await screen.findByText('No tanks yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add your first tank' }))

    expect(screen.getByLabelText('Tank name or ID')).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Add the first tank' })).toBeInTheDocument()
  })

  it('shows each tank as a card with a gauge of its stock, its nozzles and last dip', async () => {
    vi.mocked(pumpApi.getTanks).mockResolvedValue([tank(11, 'T1', 12345.5)])
    vi.mocked(inventoryApi.getDipChecks).mockResolvedValue({ content: [{ tankId: 11, checkedAt: '2026-11-21T06:00:00Z' }] } as never)
    renderWithProviders(<TanksContent pump={pump} />)

    const card = await screen.findByRole('article', { name: 'T1, Petrol' })
    const gauge = within(card).getByRole('meter', { name: 'Stock in T1' })
    expect(gauge).toHaveAttribute('aria-valuenow', '62')
    expect(gauge).toHaveAttribute('aria-valuetext', '62% full · 12,345.50 L of 20,000 L')
    expect(within(card).getByText('62% full')).toBeInTheDocument()
    expect(within(card).getByText('12,345.50 L of 20,000 L')).toBeInTheDocument()
    expect(within(card).getByText('2 nozzles mapped')).toBeInTheDocument()
    expect(await within(card).findByText('Last dip 21 Nov 2026')).toBeInTheDocument()
    expect(within(card).queryByText('Low stock')).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Disable tank T1' })).toBeInTheDocument()
  })

  it('marks a tank the inventory counts as low, and an empty tank, in words', async () => {
    vi.mocked(pumpApi.getTanks).mockResolvedValue([tank(11, 'T1', 900), tank(12, 'T2', 0, 'DIESEL')])
    vi.mocked(inventoryApi.getTankStocks).mockResolvedValue([stock(11, true), stock(12, false)])
    renderWithProviders(<TanksContent pump={pump} />)

    const low = await screen.findByRole('article', { name: 'T1, Petrol' })
    expect(await within(low).findByText('Low stock')).toBeInTheDocument()
    expect(within(low).getByText('5% full')).toBeInTheDocument()

    const empty = screen.getByRole('article', { name: 'T2, Diesel' })
    expect(within(empty).getByText('Empty')).toBeInTheDocument()
    expect(within(empty).getByRole('meter')).toHaveAttribute('aria-valuenow', '0')
    expect(within(empty).getByText('No nozzle mapped')).toBeInTheDocument()
  })

  it('opens the edit form from a tank card', async () => {
    const user = userEvent.setup()
    vi.mocked(pumpApi.getTanks).mockResolvedValue([tank(11, 'T1', 500)])
    renderWithProviders(<TanksContent pump={pump} />)

    const card = await screen.findByRole('article', { name: 'T1, Petrol' })
    await user.click(within(card).getByRole('button', { name: 'Edit' }))

    expect(within(card).getByRole('button', { name: 'Save tank' })).toBeInTheDocument()
    expect(within(card).getByLabelText('Tank name or ID')).toHaveValue('T1')
  })
})
