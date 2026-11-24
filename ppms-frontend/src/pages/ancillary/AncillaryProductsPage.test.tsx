import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { UserRole } from '../../types/auth'
import type { PagedResponse } from '../../types/paged'
import AncillaryProductsPage from './AncillaryProductsPage'

vi.mock('../../api/ancillaryApi', () => ({
  ancillaryApi: {
    getProducts: vi.fn(),
    getPriceHistory: vi.fn(),
    getLots: vi.fn(),
    getDeliveries: vi.fn(),
    getSales: vi.fn(),
  },
}))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn().mockResolvedValue([]) } }))

const PUMP_ID = 3

function product(id: number, displayName: string, currentStockUnits: number): AncillaryProduct {
  return {
    id, pumpId: PUMP_ID, name: displayName, brand: null, variant: null, packageSize: 1, unitOfMeasure: 'LITRE',
    currentStockUnits, lowStockThreshold: null, status: 'ACTIVE', fifoCostPricePerUnit: 100,
    activeFifoLots: [], currentSellingPricePerUnit: 150, soldTodayUnits: 0, soldTodayAmount: 0, displayName, createdAt: '', updatedAt: '',
  }
}

function emptyPage<T>(): PagedResponse<T> {
  return { content: [], page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false }
}

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: PUMP_ID }, isAuthenticated: true })
}

function CurrentSearch() {
  return <output aria-label="Address">{useLocation().search}</output>
}

describe('AncillaryProductsPage', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: PUMP_ID })
    vi.mocked(ancillaryApi.getProducts).mockResolvedValue([product(1, 'Engine Oil 1L', 12), product(2, 'Coolant 1L', 0)])
    vi.mocked(ancillaryApi.getPriceHistory).mockResolvedValue([])
    vi.mocked(ancillaryApi.getLots).mockResolvedValue([])
    vi.mocked(ancillaryApi.getDeliveries).mockResolvedValue(emptyPage())
    vi.mocked(ancillaryApi.getSales).mockResolvedValue(emptyPage())
  })

  it('heads the page with the product count and keeps the open tab in the address', async () => {
    signIn('OWNER')
    const user = userEvent.setup()
    renderWithProviders(<><AncillaryProductsPage /><CurrentSearch /></>)

    expect(screen.getByRole('heading', { level: 1, name: 'Products' })).toBeInTheDocument()
    expect(await screen.findByText('2 products')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Products' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('link', { name: 'Stock In' }))

    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('tab=stock-in')
    expect(screen.getByRole('link', { name: 'Stock In' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Record Stock Delivery' })).toBeInTheDocument()
  })

  it('starts a sale from the address by asking which product in stock is being sold', async () => {
    signIn('MANAGER')
    const user = userEvent.setup()
    renderWithProviders(<><AncillaryProductsPage /><CurrentSearch /></>, { route: '/dashboard/ancillary?action=sell-product' })

    const picker = await screen.findByRole('dialog', { name: 'Record sale' })
    expect(within(picker).getByRole('button', { name: 'Continue' })).toBeDisabled()

    await user.click(within(picker).getByRole('button', { name: /Product:/ }))
    expect(screen.queryByRole('option', { name: /Coolant/ })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('option', { name: /Engine Oil 1L/ }))
    await user.click(within(picker).getByRole('button', { name: 'Continue' }))

    expect(await screen.findByLabelText('Quantity')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).not.toHaveTextContent('action=')
  })

  it('marks a product without a selling price in the sale picker', async () => {
    signIn('MANAGER')
    vi.mocked(ancillaryApi.getProducts).mockResolvedValue([
      product(1, 'Engine Oil 1L', 12),
      { ...product(3, 'Brake Fluid', 4), currentSellingPricePerUnit: null },
    ])
    const user = userEvent.setup()
    renderWithProviders(<AncillaryProductsPage />, { route: '/dashboard/ancillary?action=sell-product' })

    const picker = await screen.findByRole('dialog', { name: 'Record sale' })
    await user.click(within(picker).getByRole('button', { name: /Product:/ }))

    expect(await screen.findByRole('option', { name: 'Brake Fluid (stock: 4) · No price' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Engine Oil 1L (stock: 12)' })).toBeInTheDocument()
  })

  it('ignores the sell address for an operator, whom the server refuses for sales', async () => {
    signIn('OPERATOR')
    renderWithProviders(<AncillaryProductsPage />, { route: '/dashboard/ancillary?action=sell-product' })

    await screen.findByText('Engine Oil 1L')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sell Product' })).not.toBeInTheDocument()
  })

  it('shows a product\'s stock lots in a side panel that Escape closes', async () => {
    signIn('MANAGER')
    const user = userEvent.setup()
    renderWithProviders(<AncillaryProductsPage />)

    const card = await screen.findByRole('article', { name: 'Engine Oil 1L' })
    await user.click(within(card).getByRole('button', { name: 'More actions for Engine Oil 1L' }))
    await user.click(screen.getByRole('menuitem', { name: /Inventory lots/ }))

    const panel = await screen.findByRole('dialog', { name: 'Stock lots' })
    expect(within(panel).getByText('Engine Oil 1L')).toBeInTheDocument()
    expect(ancillaryApi.getLots).toHaveBeenCalledWith(PUMP_ID, 1)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Stock lots' })).not.toBeInTheDocument()
  })
})
