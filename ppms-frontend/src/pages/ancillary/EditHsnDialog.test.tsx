import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../types/auth'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ProductsTab } from './ProductsTab'

vi.mock('../../api/ancillaryApi', () => ({ ancillaryApi: { updateProduct: vi.fn(), setProductStatus: vi.fn() } }))

const product = {
  id: 9, pumpId: 1, name: 'Engine Oil', brand: 'Castrol', variant: null, packageSize: 1, unitOfMeasure: 'LITRE',
  currentStockUnits: 12, lowStockThreshold: null, hsnCode: '2710', status: 'ACTIVE', fifoCostPricePerUnit: 310,
  activeFifoLots: [], currentSellingPricePerUnit: 150, soldTodayUnits: 0, soldTodayAmount: 0, displayName: 'Castrol Engine Oil — 1 LITRE', createdAt: '2026-01-01', updatedAt: '2026-01-01',
} as AncillaryProduct

function renderAs(role: UserRole, onRefresh = vi.fn()) {
  useAuthStore.setState({ user: { userId: 5, fullName: 'User', role, assignedPumpId: 1 }, isAuthenticated: true })
  const isOwnerOrAdmin = role === 'OWNER' || role === 'ADMIN'
  renderWithProviders(
    <ProductsTab pumpId={1} products={[product]} loading={false} isOwnerOrAdmin={isOwnerOrAdmin}
      isManagerOrAbove={isOwnerOrAdmin || role === 'MANAGER'} isAddingProduct={false} onAddProductClosed={vi.fn()} onRefresh={onRefresh} />,
  )
}

async function editHsnItem(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'More actions for Castrol Engine Oil' }))
  return screen.getByRole('menuitem', { name: /Edit HSN/ })
}

describe('editing the HSN code of an existing product', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ancillaryApi.updateProduct).mockResolvedValue({ ...product, hsnCode: '27101980' })
  })

  it('saves the new HSN code through the product update', async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    renderAs('OWNER', onRefresh)
    const editHsn = await editHsnItem(user)
    expect(editHsn).toHaveTextContent('HSN 2710')

    await user.click(editHsn)
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('HSN code')
    expect(input).toHaveValue('2710')
    await user.clear(input)
    await user.type(input, '27101980')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(ancillaryApi.updateProduct).toHaveBeenCalledWith(1, 9, { hsnCode: '27101980' })
    expect(onRefresh).toHaveBeenCalled()
  })

  it('refuses an HSN code shorter than 4 digits', async () => {
    const user = userEvent.setup()
    renderAs('ADMIN')

    await user.click(await editHsnItem(user))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('HSN code')
    await user.clear(input)
    await user.type(input, '27')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('HSN code must be 4 to 8 digits')
    expect(ancillaryApi.updateProduct).not.toHaveBeenCalled()
  })

  it('is not offered to a manager, whom the server refuses', async () => {
    const user = userEvent.setup()
    renderAs('MANAGER')
    await user.click(screen.getByRole('button', { name: 'More actions for Castrol Engine Oil' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Edit HSN/ })).not.toBeInTheDocument()
  })
})
