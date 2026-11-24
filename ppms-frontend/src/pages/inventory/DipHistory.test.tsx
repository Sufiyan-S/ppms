import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '../../api/inventoryApi'
import type { DipCheck, TankStock } from '../../api/inventoryApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { PagedResponse } from '../../types/paged'
import { DipHistory } from './DipHistory'

vi.mock('../../api/inventoryApi', () => ({ inventoryApi: { getDipChecks: vi.fn(), reviewDipCheck: vi.fn() } }))

const TANKS: TankStock[] = [
  { tankId: 1, tankIdentifier: 'P1', fuelType: 'PETROL', capacity: 10_000, currentStock: 4_000, stockPercentage: 40, lowStock: false, dipTolerance: 50, pumpId: 3 },
  { tankId: 2, tankIdentifier: 'D1', fuelType: 'DIESEL', capacity: 10_000, currentStock: 4_000, stockPercentage: 40, lowStock: false, dipTolerance: 50, pumpId: 3 },
]

function dipCheck(id: number, tank: TankStock): DipCheck {
  return {
    id, tankId: tank.tankId, tankIdentifier: tank.tankIdentifier, fuelType: tank.fuelType, measuredQuantity: 4_000, systemStock: 4_000,
    variance: 0, notes: null, checkedAt: '2026-11-20T06:00:00Z', loggedByUserName: 'Ravi', checkedByUserName: null,
    createdAt: '2026-11-20T06:00:00Z', status: 'WITHIN_TOLERANCE', reviewedAt: null, reviewedByUserName: null,
  }
}

function page(content: DipCheck[], totalElements = content.length): PagedResponse<DipCheck> {
  return { content, page: 0, pageSize: 10, totalElements, totalPages: Math.max(1, Math.ceil(totalElements / 10)), hasNext: totalElements > 10, hasPrevious: false }
}

async function chooseTank(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Filter DIP checks by tank/ }))
  await user.click(await screen.findByRole('option', { name }))
}

describe('DipHistory', () => {
  beforeEach(() => {
    vi.mocked(inventoryApi.getDipChecks).mockReset()
  })

  it('asks the server for the chosen tank, so matches on later pages are found', async () => {
    vi.mocked(inventoryApi.getDipChecks).mockImplementation(async (_pumpId, _page, _size, filters) =>
      filters?.tankId === 2 ? page([dipCheck(9, TANKS[1])]) : page([dipCheck(1, TANKS[0])], 25))
    renderWithProviders(<DipHistory pumpId={3} tanks={TANKS} canViewFinancials />)
    expect(await screen.findByText('P1')).toBeInTheDocument()
    expect(inventoryApi.getDipChecks).toHaveBeenLastCalledWith(3, 0, 10, { tankId: undefined, fuelType: undefined })

    await chooseTank('D1')

    expect(await screen.findByText('D1', { selector: ':not(button *)' })).toBeInTheDocument()
    expect(inventoryApi.getDipChecks).toHaveBeenLastCalledWith(3, 0, 10, { tankId: 2, fuelType: undefined })
    expect(screen.queryByText(/match the selected filters/)).not.toBeInTheDocument()
  })

  it('says nothing matches only when the server finds no check for the filter', async () => {
    vi.mocked(inventoryApi.getDipChecks).mockImplementation(async (_pumpId, _page, _size, filters) =>
      filters?.tankId ? page([]) : page([dipCheck(1, TANKS[0])]))
    renderWithProviders(<DipHistory pumpId={3} tanks={TANKS} canViewFinancials />)
    await screen.findByText('P1')

    await chooseTank('D1')

    expect(await screen.findByText('No DIP checks match the selected filters.')).toBeInTheDocument()
  })

  it('keeps the current checks on screen, marked busy, while the filtered ones load', async () => {
    let finishFiltered: (result: PagedResponse<DipCheck>) => void = () => {}
    vi.mocked(inventoryApi.getDipChecks).mockImplementation((_pumpId, _page, _size, filters) =>
      filters?.tankId ? new Promise(resolve => { finishFiltered = resolve }) : Promise.resolve(page([dipCheck(1, TANKS[0])])))
    renderWithProviders(<DipHistory pumpId={3} tanks={TANKS} canViewFinancials />)
    await screen.findByText('P1')

    await chooseTank('D1')

    const busy = screen.getByText('P1').closest('[aria-busy]') as HTMLElement
    expect(busy).toHaveAttribute('aria-busy', 'true')
    finishFiltered(page([dipCheck(9, TANKS[1])]))
    expect(await within(busy).findByText('D1')).toBeInTheDocument()
    expect(busy).toHaveAttribute('aria-busy', 'false')
  })
})
