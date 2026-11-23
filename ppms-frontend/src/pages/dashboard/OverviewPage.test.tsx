import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { shiftApi } from '../../api/shiftApi'
import { inventoryApi } from '../../api/inventoryApi'
import { attentionApi } from '../../api/attentionApi'
import type { TankStock } from '../../api/inventoryApi'
import type { Shift } from '../../types/shift'
import type { UserRole } from '../../types/auth'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import OverviewPage from './OverviewPage'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { getMyPumps: vi.fn(), getCurrentPrices: vi.fn() } }))
vi.mock('../../api/shiftApi', () => ({ shiftApi: { getActiveShifts: vi.fn(), getShiftHistory: vi.fn() } }))
vi.mock('../../api/inventoryApi', () => ({ inventoryApi: { getTankStocks: vi.fn() } }))
vi.mock('../../api/attentionApi', () => ({ attentionApi: { getForPump: vi.fn(), getForMyPumps: vi.fn() } }))
vi.mock('./overview/MoneyOverview', () => ({ MoneyOverview: () => null }))
vi.mock('./overview/RevenueTrendChart', () => ({ RevenueTrendChart: () => null }))
vi.mock('./overview/TankStockOverview', () => ({ TankStockOverview: () => null }))
vi.mock('../shifts/OpenShiftModal', () => ({ default: () => <div role="dialog" aria-label="Open shift form" /> }))
vi.mock('../inventory/record-delivery/RecordDeliveryModal', () => ({
  RecordDeliveryModal: () => <div role="dialog" aria-label="Delivery form" />,
}))

const highway = { id: 4, name: 'Highway Pump', createdAt: '2026-01-01T00:00:00Z' } as PumpSummary
const tank = { tankId: 1, tankIdentifier: 'T1', fuelType: 'PETROL', lowStock: false, stockPercentage: 50 } as TankStock

const rajuShift = {
  id: 11, pumpId: 4, duName: 'DU A', duNumber: 1, operatorName: 'Raju', status: 'OPEN', shiftWindow: 'MORNING',
  actualStartTime: new Date(Date.now() - (3 * 60 + 10) * 60_000).toISOString(),
  nozzles: [], fuelReadings: [],
  creditEntries: [{ id: 1, amount: 1250, voidStatus: 'ACTIVE' }],
} as unknown as Shift

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'Meena', role, assignedPumpId: 4 }, isAuthenticated: true })
}

function renderOverview(role: UserRole) {
  signIn(role)
  return renderWithProviders(<OverviewPage />)
}

describe('OverviewPage manager home', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null })
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([highway])
    vi.mocked(pumpApi.getCurrentPrices).mockResolvedValue([])
    vi.mocked(shiftApi.getActiveShifts).mockResolvedValue([rajuShift])
    vi.mocked(shiftApi.getShiftHistory).mockResolvedValue([])
    vi.mocked(inventoryApi.getTankStocks).mockResolvedValue([tank])
    vi.mocked(attentionApi.getForPump).mockResolvedValue([])
  })

  it('shows a compact header, the four quick actions and a live row per open shift', async () => {
    renderOverview('MANAGER')

    expect(await screen.findByRole('heading', { level: 1, name: 'Highway Pump' })).toBeInTheDocument()
    expect(screen.queryByText('Live operations snapshot')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open shift' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dip check' })).toHaveAttribute('href', '/dashboard/inventory')
    expect(screen.getByRole('link', { name: 'Cash entry' })).toHaveAttribute('href', '/dashboard/cash')
    expect(await screen.findByRole('link', { name: 'Raju · DU A · open 3h 10m · ₹1,250.00 credit' })).toBeInTheDocument()
  })

  it('opens the existing open-shift and delivery forms from the quick actions', async () => {
    const user = userEvent.setup()
    renderOverview('MANAGER')

    await user.click(await screen.findByRole('button', { name: 'Open shift' }))
    expect(screen.getByRole('dialog', { name: 'Open shift form' })).toBeInTheDocument()

    const delivery = screen.getByRole('button', { name: 'Delivery' })
    await vi.waitFor(() => expect(delivery).toBeEnabled())
    await user.click(delivery)
    expect(screen.getByRole('dialog', { name: 'Delivery form' })).toBeInTheDocument()
  })

  it('refreshes open shifts every 15 seconds for a manager, only while the tab is visible', async () => {
    const { queryClient } = renderOverview('MANAGER')
    await screen.findByRole('heading', { level: 1, name: 'Highway Pump' })

    const options = queryClient.getQueryCache().find({ queryKey: ['activeShifts', 4] })!.observers[0].options
    expect(options.refetchInterval).toBe(15_000)
    expect(options.refetchIntervalInBackground).toBe(false)
  })

  it('does not ask the manager home for the attention inbox', async () => {
    renderOverview('MANAGER')

    await screen.findByRole('heading', { level: 1, name: 'Highway Pump' })
    expect(screen.queryByRole('heading', { name: 'Needs attention today' })).not.toBeInTheDocument()
    expect(attentionApi.getForPump).not.toHaveBeenCalled()
  })
})

describe('OverviewPage owner and accountant home', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null })
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([highway])
    vi.mocked(pumpApi.getCurrentPrices).mockResolvedValue([])
    vi.mocked(shiftApi.getActiveShifts).mockReset().mockResolvedValue([rajuShift])
    vi.mocked(shiftApi.getShiftHistory).mockResolvedValue([])
    vi.mocked(inventoryApi.getTankStocks).mockResolvedValue([tank])
    vi.mocked(attentionApi.getForPump).mockResolvedValue([])
  })

  it('replaces the greeting with a compact header and the inbox, keeping the one-minute refresh', async () => {
    const { queryClient } = renderOverview('OWNER')

    expect(await screen.findByRole('heading', { level: 1, name: 'Highway Pump' })).toBeInTheDocument()
    expect(screen.queryByText('Live operations snapshot')).not.toBeInTheDocument()
    expect(await screen.findByText('All clear for today')).toBeInTheDocument()
    expect(attentionApi.getForPump).toHaveBeenCalledWith(4)
    expect(screen.queryByRole('button', { name: 'Open shift' })).not.toBeInTheDocument()
    const options = queryClient.getQueryCache().find({ queryKey: ['activeShifts', 4] })!.observers[0].options
    expect(options.refetchInterval).toBe(60_000)
  })

  it('leads with the headline figures, then puts the inbox beside the live shifts', async () => {
    renderOverview('OWNER')

    expect(await screen.findByRole('region', { name: 'Today at a glance' })).toBeInTheDocument()
    const inbox = await screen.findByRole('region', { name: 'Needs attention today' })
    const liveShifts = await screen.findByRole('region', { name: 'Live Shifts' })
    expect(inbox.parentElement).toBe(liveShifts.closest('.ui-dashboard-columns'))
  })

  it('links the three stat cards to the shifts, shift history and inventory pages', async () => {
    renderOverview('ADMIN')

    expect(await screen.findByRole('link', { name: /Active Shifts/ })).toHaveAttribute('href', '/dashboard/shifts')
    expect(screen.getByRole('link', { name: /Today's Revenue/ })).toHaveAttribute('href', '/dashboard/shifts?history=all')
    expect(screen.getByRole('link', { name: /Low Stock Tanks/ })).toHaveAttribute('href', '/dashboard/inventory')
  })

  it('shows an accountant only the header and the inbox', async () => {
    renderOverview('ACCOUNTANT')

    expect(await screen.findByRole('heading', { level: 1, name: 'Highway Pump' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Needs attention today' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Active Shifts/ })).not.toBeInTheDocument()
    expect(shiftApi.getActiveShifts).not.toHaveBeenCalled()
  })
})
