import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../../api/pumpApi'
import { reportApi } from '../../../api/reportApi'
import type { AllTanksInventoryReport } from '../../../api/reportApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { InventoryLotsTab } from './InventoryLotsTab'

vi.mock('../../../api/pumpApi', () => ({ pumpApi: { getTanks: vi.fn() } }))
vi.mock('../../../api/reportApi', () => ({
  reportApi: { getAllTanksInventoryLots: vi.fn(), getInventoryLots: vi.fn() },
}))

describe('InventoryLotsTab all-tanks date range', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T06:00:00Z'))
    vi.mocked(pumpApi.getTanks).mockResolvedValue([])
    vi.mocked(reportApi.getAllTanksInventoryLots).mockResolvedValue({ tanks: [], fuelTypeSummaries: [] } as unknown as AllTanksInventoryReport)
  })
  afterEach(() => vi.useRealTimers())

  it('asks for the last 90 days by default', async () => {
    renderWithProviders(<InventoryLotsTab pumpId={4} />)

    await waitFor(() => expect(reportApi.getAllTanksInventoryLots).toHaveBeenCalledWith(4, '2026-08-23', '2026-11-20'))
    expect(screen.getByText(/Showing every active lot/)).toBeInTheDocument()
  })

  it('reloads with the chosen range when Load Lots is pressed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<InventoryLotsTab pumpId={4} />)

    const fromInput = screen.getByLabelText('From')
    await user.clear(fromInput)
    await user.type(fromInput, '2026-01-01')
    await user.click(screen.getByRole('button', { name: 'Load Lots' }))

    await waitFor(() => expect(reportApi.getAllTanksInventoryLots).toHaveBeenCalledWith(4, '2026-01-01', '2026-11-20'))
  })
})
