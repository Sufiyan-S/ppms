import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../types/auth'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ProductsTab } from './ProductsTab'

const product = {
  id: 1, name: 'Engine Oil 1L', category: 'LUBRICANT', unitType: 'LITRE', unitSize: 1, status: 'ACTIVE',
  currentStockUnits: 12, lowStockThreshold: null, fifoCostPricePerUnit: 310,
} as unknown as AncillaryProduct

function renderAs(role: UserRole) {
  useAuthStore.setState({ user: { userId: 5, fullName: 'User', role, assignedPumpId: 1 }, isAuthenticated: true })
  const isOwnerOrAdmin = role === 'OWNER' || role === 'ADMIN'
  renderWithProviders(
    <ProductsTab pumpId={1} products={[product]} loading={false} isOwnerOrAdmin={isOwnerOrAdmin}
      isManagerOrAbove={isOwnerOrAdmin || role === 'MANAGER'} isAddingProduct={false} onAddProductClosed={vi.fn()} onRefresh={vi.fn()} />,
  )
}

describe('ProductsTab by role', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hides Sell and the buy price from an operator, whom the server refuses for sales', () => {
    renderAs('OPERATOR')
    expect(screen.queryByRole('button', { name: 'Sell' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Buy:/)).not.toBeInTheDocument()
  })

  it('shows the buy price to a manager', () => {
    renderAs('MANAGER')
    expect(screen.getByRole('button', { name: 'Sell' })).toBeInTheDocument()
    expect(screen.getByText(/Buy:/)).toBeInTheDocument()
  })
})
