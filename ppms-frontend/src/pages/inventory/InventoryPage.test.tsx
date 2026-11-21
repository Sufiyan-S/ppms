import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '../../api/inventoryApi'
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
  },
}))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getMyPumps: vi.fn().mockResolvedValue([]) } }))

const PUMP_ID = 6
function emptyPage<T>(): PagedResponse<T> {
  return { content: [], page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false }
}

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: PUMP_ID }, isAuthenticated: true })
}

describe('InventoryPage dip check access', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: PUMP_ID })
    vi.mocked(inventoryApi.getTankStocks).mockResolvedValue([
      { tankId: 1, tankIdentifier: 'T1', fuelType: 'PETROL', capacity: 10_000, currentStock: 4_000, stockPercentage: 40, lowStock: false, dipTolerance: 50, pumpId: PUMP_ID },
    ])
    vi.mocked(inventoryApi.getDipChecks).mockResolvedValue(emptyPage())
    vi.mocked(inventoryApi.getDeliveries).mockResolvedValue(emptyPage())
  })

  it('lets a manager record a dip check, as the backend allows', async () => {
    signIn('MANAGER')
    renderWithProviders(<InventoryPage />)
    expect(await screen.findByRole('button', { name: 'DIP Check' })).toBeInTheDocument()
  })

  it('does not offer a dip check to an operator', async () => {
    signIn('OPERATOR')
    renderWithProviders(<InventoryPage />)
    await screen.findByText('T1')
    expect(screen.queryByRole('button', { name: 'DIP Check' })).not.toBeInTheDocument()
  })
})
