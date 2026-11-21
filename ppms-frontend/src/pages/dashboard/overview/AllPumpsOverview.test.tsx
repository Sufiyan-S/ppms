import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi, type PumpsOverview } from '../../../api/pumpApi'
import { usePumpStore } from '../../../store/usePumpStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { AllPumpsOverview, OverviewScopeToggle } from './AllPumpsOverview'

vi.mock('../../../api/pumpApi', () => ({ pumpApi: { getPumpsOverview: vi.fn() } }))

const overview: PumpsOverview = {
  pumps: [
    { pumpId: 1, name: 'North Pump', enabled: true, todaySales: 12_000, openShiftCount: 2, overdueShiftCount: 1, lowStockTankCount: 0, fuelPricesStale: false },
    { pumpId: 2, name: 'South Pump', enabled: true, todaySales: 3_500, openShiftCount: 0, overdueShiftCount: 0, lowStockTankCount: 1, fuelPricesStale: true },
  ],
  totals: { todaySales: 15_500, openShiftCount: 2, overdueShiftCount: 1, lowStockTankCount: 1, stalePricePumpCount: 1 },
}

function statCard(label: string) {
  return screen.getByText(label).closest('.ui-dashboard-stat') as HTMLElement
}

describe('AllPumpsOverview', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getPumpsOverview).mockResolvedValue(overview)
    usePumpStore.setState({ selectedPumpId: 1 })
  })

  it('shows the totals across all pumps', async () => {
    renderWithProviders(<AllPumpsOverview onPumpSelected={vi.fn()} />)

    await screen.findByRole('button', { name: /North Pump/ })
    expect(await within(statCard("Today's Revenue")).findByText('₹15,500')).toBeInTheDocument()
    expect(within(statCard('Active Shifts')).getByText('1 shift overdue')).toBeInTheDocument()
    expect(within(statCard('Low Stock Tanks')).getByText('Need attention')).toBeInTheDocument()
    expect(within(statCard('Stale Fuel Prices')).getByText('Pumps to update in Setup')).toBeInTheDocument()
  })

  it('shows a row per pump with its own figures', async () => {
    renderWithProviders(<AllPumpsOverview onPumpSelected={vi.fn()} />)

    const north = await screen.findByRole('button', { name: /North Pump/ })
    expect(within(north).getByText('₹12,000')).toBeInTheDocument()
    expect(within(north).getByText('2 active shifts')).toBeInTheDocument()
    expect(within(north).getByText('1 overdue shift')).toBeInTheDocument()
    expect(within(north).queryByText('Prices not updated today')).not.toBeInTheDocument()

    const south = screen.getByRole('button', { name: /South Pump/ })
    expect(within(south).getByText('₹3,500')).toBeInTheDocument()
    expect(within(south).getByText('1 low tank')).toBeInTheDocument()
    expect(within(south).getByText('Prices not updated today')).toBeInTheDocument()
  })

  it('selects the pump and returns to its overview when its row is clicked', async () => {
    const onPumpSelected = vi.fn()
    renderWithProviders(<AllPumpsOverview onPumpSelected={onPumpSelected} />)

    await userEvent.click(await screen.findByRole('button', { name: /South Pump/ }))

    expect(usePumpStore.getState().selectedPumpId).toBe(2)
    expect(onPumpSelected).toHaveBeenCalledOnce()
  })

  it('says so when the figures cannot be loaded', async () => {
    vi.mocked(pumpApi.getPumpsOverview).mockRejectedValue(new Error('down'))
    renderWithProviders(<AllPumpsOverview onPumpSelected={vi.fn()} />)

    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument()
  })
})

describe('OverviewScopeToggle', () => {
  it('is hidden when the user has only one pump', () => {
    const { container } = render(
      <OverviewScopeToggle pumpCount={1} selectedPumpName="North Pump" showAllPumps={false} onShowAllPumpsChange={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('marks the current scope as pressed and switches to all pumps', async () => {
    const onShowAllPumpsChange = vi.fn()
    render(
      <OverviewScopeToggle pumpCount={2} selectedPumpName="North Pump" showAllPumps={false} onShowAllPumpsChange={onShowAllPumpsChange} />,
    )

    expect(screen.getByRole('button', { name: 'North Pump' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All pumps' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(screen.getByRole('button', { name: 'All pumps' }))

    expect(onShowAllPumpsChange).toHaveBeenCalledWith(true)
  })
})
