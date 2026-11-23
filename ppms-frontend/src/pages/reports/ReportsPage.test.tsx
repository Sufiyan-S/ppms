import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportApi } from '../../api/reportApi'
import type { ProfitLossReport } from '../../api/reportApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import ReportsPage from './ReportsPage'
import { presetRange } from '../../utils/datePresets'

vi.mock('../../api/reportApi', () => ({
  reportApi: { getProfitLoss: vi.fn(), getExpensesReport: vi.fn().mockResolvedValue([]), getShiftsReport: vi.fn().mockResolvedValue([]) },

}))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getMyPumps: vi.fn().mockResolvedValue([]) } }))

const PUMP_ID = 6

const reportWithOneLotAtTwoPrices: ProfitLossReport = {
  pumpId: PUMP_ID, from: '2026-01-01', to: '2026-01-31', totalShifts: 2,
  totalRevenue: 3000, totalCogs: 2700, grossProfit: 300,
  totalCashRevenue: 3000, totalUpiRevenue: 0, totalCardRevenue: 0, totalCreditRevenue: 0,
  byFuelType: [{
    fuelType: 'PETROL', revenue: 3000, cogs: 2700, grossProfit: 300, grossMarginPerLitre: 10,
    lotCostLines: [
      { lotId: 9, tankerReference: 'INV-9', deliveryDate: '2026-01-02', costPricePerUnit: 90, quantityConsumed: 20, lotCost: 1800 },
      { lotId: 9, tankerReference: 'INV-9', deliveryDate: '2026-01-02', costPricePerUnit: 91, quantityConsumed: 10, lotCost: 910 },
    ],
  }],
  byDay: [{ date: '2026-01-10', revenue: 3000, cogs: 2700, grossProfit: 300 }],
}

function renderReportsAt(path: string) {
  const router = createMemoryRouter([{ path: '/dashboard/reports', element: <ReportsPage /> }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('ReportsPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: PUMP_ID })
    vi.mocked(reportApi.getProfitLoss).mockResolvedValue(reportWithOneLotAtTwoPrices)
  })

  it('opens the tab and date range named in the address, as after a refresh', async () => {
    renderReportsAt('/dashboard/reports?tab=pl&from=2026-01-01&to=2026-01-31')

    await waitFor(() => expect(reportApi.getProfitLoss).toHaveBeenCalledWith(PUMP_ID, '2026-01-01', '2026-01-31'))
    expect(screen.getByRole('link', { name: 'Profit & Loss' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByLabelText('From')).toHaveValue('2026-01-01')
  })

  it('shows the report types as tabs under the page title', async () => {
    renderReportsAt('/dashboard/reports?tab=expenses')

    const tabs = screen.getByRole('navigation', { name: 'Report types' })
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument()
    expect(within(tabs).getByRole('link', { name: 'Expenses' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Profit & Loss' })).not.toHaveAttribute('aria-current')
    await waitFor(() => expect(reportApi.getExpensesReport).toHaveBeenCalled())
  })

  it('keeps the presets, dates and report actions in one filter bar', async () => {
    renderReportsAt('/dashboard/reports?tab=pl&from=2026-01-01&to=2026-01-31')

    expect(await screen.findByRole('region', { name: 'Report totals' })).toBeInTheDocument()
    const filters = screen.getByRole('group', { name: 'Report filters' })
    expect(within(filters).getByRole('button', { name: 'Last month' })).toBeInTheDocument()
    expect(within(filters).getByLabelText('From')).toHaveValue('2026-01-01')
    expect(within(filters).getByLabelText('To')).toHaveValue('2026-01-31')
    expect(within(filters).getByRole('button', { name: 'Generate' })).toBeInTheDocument()
  })

  it('writes the generated range into the address and keeps it when switching tab', async () => {
    const user = userEvent.setup()
    const router = renderReportsAt('/dashboard/reports?tab=pl&from=2026-01-01&to=2026-01-31')

    const from = await screen.findByLabelText('From')
    await user.clear(from)
    await user.type(from, '2026-01-05')
    expect(router.state.location.search).toBe('?tab=pl&from=2026-01-01&to=2026-01-31')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(router.state.location.search).toBe('?tab=pl&from=2026-01-05&to=2026-01-31')

    await user.click(screen.getByRole('link', { name: 'Shifts' }))
    expect(router.state.location.search).toBe('?tab=shifts&from=2026-01-05&to=2026-01-31')
  })

  it('keeps the chosen dates when switching to another tab', async () => {
    const user = userEvent.setup()
    const router = renderReportsAt('/dashboard/reports?tab=pl')

    const from = await screen.findByLabelText('From')
    await user.clear(from)
    await user.type(from, '2026-02-01')
    const to = screen.getByLabelText('To')
    await user.clear(to)
    await user.type(to, '2026-02-10')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await user.click(screen.getByRole('link', { name: 'Expenses' }))

    await waitFor(() => expect(reportApi.getExpensesReport).toHaveBeenCalledWith(PUMP_ID, '2026-02-01', '2026-02-10'))
    expect(screen.getByLabelText('From')).toHaveValue('2026-02-01')
    expect(router.state.location.search).toBe('?tab=expenses&from=2026-02-01&to=2026-02-10')
  })

  it('applies a quick range to the address straight away', async () => {
    const user = userEvent.setup()
    const router = renderReportsAt('/dashboard/reports?tab=pl&from=2026-01-01&to=2026-01-31')

    await user.click(await screen.findByRole('button', { name: 'Last month' }))

    const lastMonth = presetRange('lastMonth')
    await waitFor(() => expect(router.state.location.search).toBe(`?tab=pl&from=${lastMonth.from}&to=${lastMonth.to}`))
    expect(screen.getByRole('button', { name: 'Last month' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('From')).toHaveValue(lastMonth.from)
  })

  it('compares the totals with the same-length period before', async () => {
    vi.mocked(reportApi.getProfitLoss).mockImplementation((_pumpId, from) =>
      Promise.resolve(from === '2026-01-01' ? reportWithOneLotAtTwoPrices : { ...reportWithOneLotAtTwoPrices, totalRevenue: 2500 }))
    renderReportsAt('/dashboard/reports?tab=pl&from=2026-01-01&to=2026-01-31')

    expect(await screen.findByText('20% up vs previous period')).toBeInTheDocument()
    expect(reportApi.getProfitLoss).toHaveBeenCalledWith(PUMP_ID, '2025-12-01', '2025-12-31')
  })

  it('links each fuel to its shifts over the report range', async () => {
    renderReportsAt('/dashboard/reports?tab=pl&from=2026-01-01&to=2026-01-31')

    expect(await screen.findByRole('link', { name: /View Petrol shifts from/ }))
      .toHaveAttribute('href', '/dashboard/shifts?history=all&from=2026-01-01&to=2026-01-31&fuel=PETROL')
  })

  it('suggests last month instead of empty totals when the default range has no shifts', async () => {
    const user = userEvent.setup()
    vi.mocked(reportApi.getProfitLoss).mockResolvedValue({ ...reportWithOneLotAtTwoPrices, totalShifts: 0, byFuelType: [], byDay: [] })
    const router = renderReportsAt('/dashboard/reports?tab=pl')

    await user.click(await screen.findByRole('button', { name: 'Show last month' }))

    expect(router.state.location.search).toContain(`from=${presetRange('lastMonth').from}`)
  })

  it('lists every lot cost line, even when one lot was drawn at two prices', async () => {
    renderReportsAt('/dashboard/reports?tab=pl&from=2026-01-01&to=2026-01-31')

    expect(await screen.findByText('₹90.00')).toBeInTheDocument()
    expect(screen.getByText('₹91.00')).toBeInTheDocument()
  })
})
