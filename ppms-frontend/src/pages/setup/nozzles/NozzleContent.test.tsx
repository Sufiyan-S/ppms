import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../../api/pumpApi'
import type { PumpSummary, TankInfo } from '../../../api/pumpApi'
import type { DUOption, NozzleDetail } from '../../../types/shift'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { NozzleContent } from './NozzleContent'

vi.mock('../../../api/pumpApi', () => ({
  pumpApi: { getDUs: vi.fn(), getTanks: vi.fn(), updateNozzleStatus: vi.fn(), createDU: vi.fn(), updateMaxDuCount: vi.fn() },
}))
vi.mock('../../../api/dipApi', () => ({ dipApi: { recordAdjustment: vi.fn(), recordDip: vi.fn() } }))

const nozzle = (id: number, nozzleNumber: number, fuelType: NozzleDetail['fuelType'], tankId: number | null, status = 'ACTIVE'): NozzleDetail =>
  ({ id, nozzleNumber, fuelType, lastReading: 12345.678, maxMeterValue: 99_999_999.999, tankId, status })

const du: DUOption = {
  id: 1, pumpId: 3, duNumber: 1, name: 'Front DU', status: 'ACTIVE',
  nozzles: [nozzle(21, 1, 'PETROL', 11), nozzle(22, 2, 'DIESEL', null), nozzle(23, 3, 'PETROL', 11, 'INACTIVE')],
}

const tanks: TankInfo[] = [
  { id: 11, pumpId: 3, tankIdentifier: 'Petrol Tank 1', fuelType: 'PETROL', capacity: 20000, currentStock: 5000, dipTolerance: 0, status: 'ACTIVE', createdAt: '' },
]

function renderNozzles(maxDuCount = 4) {
  const pump = { id: 3, maxDuCount, dus: [du] } as unknown as PumpSummary
  return renderWithProviders(<NozzleContent pump={pump} onAdded={vi.fn()} />)
}

describe('NozzleContent', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([du])
    vi.mocked(pumpApi.getTanks).mockResolvedValue(tanks)
  })

  it('shows each DU as a card with its number, status and nozzle count', async () => {
    renderNozzles()

    const card = await screen.findByRole('article', { name: 'Front DU' })
    expect(within(card).getByText('DU #1')).toBeInTheDocument()
    expect(within(card).getByText('3 nozzles · 2 active')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Add nozzle' })).toBeInTheDocument()
  })

  it('shows a tile per nozzle with its fuel, meter reading, tank and status', async () => {
    renderNozzles()

    const petrol = await screen.findByRole('listitem', { name: 'Nozzle #1, Petrol' })
    expect(within(petrol).getByText('Meter 12,345.678 L')).toBeInTheDocument()
    expect(await within(petrol).findByText('Tank Petrol Tank 1')).toBeInTheDocument()
    expect(within(petrol).getByText('Active')).toBeInTheDocument()

    const diesel = screen.getByRole('listitem', { name: 'Nozzle #2, Diesel' })
    expect(within(diesel).getByText('No tank mapped')).toBeInTheDocument()

    const disabled = screen.getByRole('listitem', { name: 'Nozzle #3, Petrol' })
    expect(within(disabled).getByText('Maintenance')).toBeInTheDocument()
    expect(within(disabled).getByRole('button', { name: 'Enable' })).toBeInTheDocument()
  })

  it.each([
    ['Adjust reading', 'Adjust meter reading'],
    ['Map tank', 'Map nozzle to tank'],
    ['Record dip', 'Record fuel dip'],
    ['Disable for maintenance', 'Disable nozzle #1'],
  ])('opens the %s panel from a nozzle tile menu', async (action, panelTitle) => {
    const user = userEvent.setup()
    renderNozzles()

    const tile = await screen.findByRole('listitem', { name: 'Nozzle #1, Petrol' })
    await user.click(within(tile).getByRole('button', { name: 'Actions for nozzle #1' }))
    await user.click(screen.getByRole('menuitem', { name: new RegExp(action) }))

    expect(screen.getByRole('heading', { name: panelTitle })).toBeInTheDocument()
  })

  it('opens the add nozzle form from the DU card', async () => {
    const user = userEvent.setup()
    renderNozzles()

    await user.click(await screen.findByRole('button', { name: 'Add nozzle' }))

    const form = screen.getByRole('form', { name: 'Add nozzle' })
    expect(screen.getAllByRole('button', { name: 'Add nozzle' })).toEqual([within(form).getByRole('button', { name: 'Add nozzle' })])

    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('form', { name: 'Add nozzle' })).not.toBeInTheDocument()
  })

  it('offers to create a DU below the cards, or to raise the limit once it is reached', async () => {
    const { unmount } = renderNozzles()
    expect(await screen.findByRole('form', { name: 'Add a new Dispensary Unit' })).toBeInTheDocument()
    unmount()

    renderNozzles(1)
    expect(await screen.findByText('Maximum DU count (1) reached.', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Increase DU limit' })).toBeInTheDocument()
  })
})
