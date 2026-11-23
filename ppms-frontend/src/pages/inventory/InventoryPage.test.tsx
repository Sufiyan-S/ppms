import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock } from '../../api/inventoryApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { UserRole } from '../../types/auth'
import type { PagedResponse } from '../../types/paged'
import InventoryPage from './InventoryPage'

vi.mock('../../api/inventoryApi', () => ({
  inventoryApi: {
    getTankStocks: vi.fn(),
    getDipChecks: vi.fn(),
    getDeliveries: vi.fn(),
    getLatestInvoiceLines: vi.fn(),
    getOpenShiftNozzles: vi.fn(),
    getActiveTankLots: vi.fn(),
  },
}))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getMyPumps: vi.fn().mockResolvedValue([]) } }))
vi.mock('../../api/userApi', () => ({ userApi: { getStaff: vi.fn().mockResolvedValue([]) } }))
vi.mock('../../api/tankerApi', () => ({ tankerApi: { getTankers: vi.fn().mockResolvedValue([]) } }))

const PUMP_ID = 6
function emptyPage<T>(): PagedResponse<T> {
  return { content: [], page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false }
}

function tank(tankId: number, tankIdentifier: string, fuelType: TankStock['fuelType'] = 'PETROL'): TankStock {
  return { tankId, tankIdentifier, fuelType, capacity: 10_000, currentStock: 4_000, stockPercentage: 40, lowStock: false, dipTolerance: 50, pumpId: PUMP_ID }
}

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: PUMP_ID }, isAuthenticated: true })
}

function CurrentSearch() {
  return <output aria-label="Address">{useLocation().search}</output>
}

function renderPage(route = '/') {
  return renderWithProviders(<><InventoryPage /><CurrentSearch /></>, { route })
}

describe('InventoryPage', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: PUMP_ID })
    vi.mocked(inventoryApi.getTankStocks).mockResolvedValue([tank(1, 'T1'), tank(2, 'T2', 'DIESEL')])
    vi.mocked(inventoryApi.getDipChecks).mockResolvedValue(emptyPage())
    vi.mocked(inventoryApi.getDeliveries).mockResolvedValue(emptyPage())
    vi.mocked(inventoryApi.getLatestInvoiceLines).mockResolvedValue([])
    vi.mocked(inventoryApi.getOpenShiftNozzles).mockResolvedValue([])
    vi.mocked(inventoryApi.getActiveTankLots).mockResolvedValue([])
  })

  it('lets a manager record a dip check, as the backend allows', async () => {
    signIn('MANAGER')
    renderPage()
    expect(await screen.findAllByRole('button', { name: 'Dip check' })).toHaveLength(2)
  })

  it('does not offer a dip check to an operator', async () => {
    signIn('OPERATOR')
    renderPage()
    await screen.findByText('T1')
    expect(screen.queryByRole('button', { name: 'Dip check' })).not.toBeInTheDocument()
  })

  it('counts overdue dip checks in the header and lists each tank as a card', async () => {
    signIn('OWNER')
    renderPage()

    expect(await screen.findByRole('article', { name: 'T1 · Petrol' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'T2 · Diesel' })).toBeInTheDocument()
    expect(screen.getByText('2 DIP checks overdue')).toBeInTheDocument()
  })

  it('opens Record Delivery from ?action=record-delivery and clears it on cancel', async () => {
    signIn('OWNER')
    const user = userEvent.setup()
    renderPage('/?action=record-delivery')

    const dialog = await screen.findByRole('dialog', { name: /Record tanker delivery/ })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).not.toHaveTextContent('action=')
  })

  it('opens the dip check for the tank in the address', async () => {
    signIn('MANAGER')
    renderPage('/?action=dip-check&tank=2')

    const dialog = await screen.findByRole('dialog', { name: /Dip check/ })
    expect(within(dialog).getByText('T2 · Diesel', { selector: '.ui-modal-subtitle' })).toBeInTheDocument()
  })

  it('starts a dip check without a tank on the first tank and lets the tank be changed', async () => {
    signIn('MANAGER')
    const user = userEvent.setup()
    renderPage('/?action=dip-check')

    const dialog = await screen.findByRole('dialog', { name: /Dip check/ })
    expect(within(dialog).getByText('T1 · Petrol', { selector: '.ui-modal-subtitle' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /^Tank:/ }))
    await user.click(screen.getByRole('option', { name: 'T2 · Diesel' }))

    expect(await screen.findByText('T2 · Diesel', { selector: '.ui-modal-subtitle' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('tank=2')
  })

  it('opens a tank card dip check into the address', async () => {
    signIn('MANAGER')
    const user = userEvent.setup()
    renderPage()

    const card = await screen.findByRole('article', { name: 'T2 · Diesel' })
    await user.click(within(card).getByRole('button', { name: 'Dip check' }))

    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('action=dip-check&tank=2')
    expect(await screen.findByRole('dialog', { name: /Dip check/ })).toBeInTheDocument()
  })

  it('shows a tank\'s stock lots in a side panel', async () => {
    signIn('OWNER')
    const user = userEvent.setup()
    renderPage()

    const card = await screen.findByRole('article', { name: 'T1 · Petrol' })
    await user.click(within(card).getByRole('button', { name: 'View lots' }))

    const panel = await screen.findByRole('dialog', { name: 'Stock lots — T1' })
    expect(within(panel).getByText('Lots shown in FIFO order — oldest consumed first')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
