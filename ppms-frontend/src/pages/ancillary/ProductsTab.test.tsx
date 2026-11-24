import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import type { UserRole } from '../../types/auth'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ProductsTab } from './ProductsTab'

vi.mock('../../api/ancillaryApi', () => ({ ancillaryApi: { setProductStatus: vi.fn(), getPriceHistory: vi.fn(), setPrice: vi.fn() } }))

const product: AncillaryProduct = {
  id: 1, pumpId: 1, name: 'Engine Oil', brand: 'Castrol', variant: null, displayName: 'Castrol Engine Oil — 1 LITRE',
  packageSize: 1, unitOfMeasure: 'LITRE', hsnCode: '2710', status: 'ACTIVE',
  currentStockUnits: 12, lowStockThreshold: null, fifoCostPricePerUnit: 360, activeFifoLots: [], currentSellingPricePerUnit: 450, soldTodayUnits: 0, soldTodayAmount: 0,
  createdAt: '2026-05-01T06:30:00Z', updatedAt: '2026-05-01T06:30:00Z',
}
const TITLE = 'Castrol Engine Oil'

function renderAs(role: UserRole, products: AncillaryProduct[] = [product]) {
  useAuthStore.setState({ user: { userId: 5, fullName: 'User', role, assignedPumpId: 1 }, isAuthenticated: true })
  const isOwnerOrAdmin = role === 'OWNER' || role === 'ADMIN'
  return renderWithProviders(
    <ProductsTab pumpId={1} products={products} loading={false} isOwnerOrAdmin={isOwnerOrAdmin}
      isManagerOrAbove={isOwnerOrAdmin || role === 'MANAGER'} isAddingProduct={false} onAddProductClosed={vi.fn()} onRefresh={vi.fn()} />,
  )
}

const card = (name = TITLE) => screen.getByRole('article', { name })
const cardNames = () => screen.getAllByRole('article').map((article) => article.getAttribute('aria-label'))

async function openMenu(user: ReturnType<typeof userEvent.setup>, name = TITLE) {
  await user.click(within(card(name)).getByRole('button', { name: `More actions for ${name}` }))
  return screen.getByRole('menu', { name: `More actions for ${name}` })
}

describe('ProductsTab card header', () => {
  it('names the product without the size and unit, which sit in a pack chip, with a pill only when disabled', () => {
    renderAs('OWNER', [
      product,
      { ...product, id: 2, name: 'Coolant', brand: null, variant: 'Green', packageSize: 0.5, status: 'INACTIVE' },
    ])

    expect(within(card()).getByRole('heading', { name: TITLE })).toBeInTheDocument()
    expect(within(card()).getByText('1 L')).toBeInTheDocument()
    expect(within(card()).queryByText('Active')).not.toBeInTheDocument()
    expect(within(card()).queryByText('Disabled')).not.toBeInTheDocument()
    expect(screen.queryByText(/LITRE/)).not.toBeInTheDocument()

    expect(within(card('Coolant Green')).getByText('500 ml')).toBeInTheDocument()
    expect(within(card('Coolant Green')).getByText('Disabled')).toBeInTheDocument()
  })

  it('has no second Products heading under the tab', () => {
    renderAs('OWNER')
    expect(screen.queryByRole('heading', { name: 'Products' })).not.toBeInTheDocument()
  })
})

describe('ProductsTab price and margin', () => {
  it('shows the selling price per unit with the margin over the buy price', () => {
    renderAs('MANAGER')
    expect(within(card()).getByText('₹450.00')).toBeInTheDocument()
    expect(within(card()).getByText(/^Margin/)).toHaveTextContent('Margin ₹90.00 · 20%')
    expect(within(card()).getByText(/^Buy/)).toHaveTextContent('Buy ₹360.00/unit · Stock value ₹4,320.00')
  })

  it('values the stock batch by batch at each batch\'s buy price', () => {
    renderAs('MANAGER', [{ ...product, currentStockUnits: 19, fifoCostPricePerUnit: 200, activeFifoLots: [
      { remainingQuantity: 4, originalQuantity: 10, costPricePerUnit: 200 },
      { remainingQuantity: 15, originalQuantity: 15, costPricePerUnit: 200 },
    ] }])
    expect(within(card()).getByText(/^Buy/)).toHaveTextContent('Buy ₹200.00/unit · Stock value ₹3,800.00')
  })

  it('says in words when the price is below the buy price', () => {
    renderAs('MANAGER', [{ ...product, fifoCostPricePerUnit: 500 }])
    expect(within(card()).getByText(/^Below cost/)).toHaveTextContent('Below cost −₹50.00 · −11.1%')
  })

  it('hides the margin, the buy price, Sell and Stock in from an operator, leaving Inventory', () => {
    renderAs('OPERATOR')
    expect(within(card()).getByText('₹450.00')).toBeInTheDocument()
    expect(screen.queryByText(/Margin/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Buy/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Stock value/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sell' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stock in/ })).not.toBeInTheDocument()
    expect(within(card()).getByRole('button', { name: 'Inventory' })).toBeInTheDocument()
  })
})

describe('ProductsTab without a selling price', () => {
  beforeEach(() => vi.clearAllMocks())

  it('offers the owner Set price, which opens the price dialog for a first price', async () => {
    vi.mocked(ancillaryApi.getPriceHistory).mockResolvedValue([])
    const user = userEvent.setup()
    renderAs('OWNER', [{ ...product, currentSellingPricePerUnit: null }])

    expect(within(card()).getByText('No selling price')).toBeInTheDocument()
    expect(within(card()).queryByRole('alert')).not.toBeInTheDocument()
    expect(within(card()).getByRole('button', { name: 'Sell' })).toBeEnabled()
    await user.click(within(card()).getByRole('button', { name: `Set selling price of ${TITLE}` }))

    const dialog = await screen.findByRole('dialog', { name: 'Set selling price' })
    expect(within(dialog).getByText('Not set')).toBeInTheDocument()
    expect(await within(dialog).findByText('No price set yet.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('New price per unit'), '80')
    expect(within(dialog).getByText('First selling price for this product')).toBeInTheDocument()
  })

  it('tells a manager to ask the owner, and blocks Sell with that reason', () => {
    renderAs('MANAGER', [{ ...product, currentSellingPricePerUnit: null }])

    expect(within(card()).getByText('Ask the owner to set a price')).toBeInTheDocument()
    expect(within(card()).queryByRole('button', { name: `Set selling price of ${TITLE}` })).not.toBeInTheDocument()
    const sell = within(card()).getByRole('button', { name: 'Sell' })
    expect(sell).toBeDisabled()
    expect(sell).toHaveAccessibleDescription('No selling price yet. Ask the owner to set one.')
  })
})

const stockBarWidth = () => (within(card()).getByTestId('stock-bar').firstElementChild as HTMLElement).style.width

describe('ProductsTab stock', () => {
  it('shows the units in stock, a Low stock pill at or below the threshold, and where low starts', () => {
    renderAs('MANAGER', [{ ...product, currentStockUnits: 5, lowStockThreshold: 5 }])
    expect(within(card()).getByText('5 units in stock')).toBeInTheDocument()
    expect(within(card()).getByText('Low stock')).toBeInTheDocument()
    expect(within(card()).getByText('Low at 5 or less')).toBeInTheDocument()
    expect(stockBarWidth()).toBe('50%')
    expect(within(card()).getByRole('button', { name: 'Sell' })).toBeEnabled()
  })

  it('always shows the stock bar, scaled to the open batches as delivered when no threshold is set', () => {
    renderAs('MANAGER', [{ ...product, currentStockUnits: 6, lowStockThreshold: null, activeFifoLots: [
      { remainingQuantity: 6, originalQuantity: 24, costPricePerUnit: 360 },
    ] }])
    expect(stockBarWidth()).toBe('25%')
    expect(within(card()).queryByText(/^Low at/)).not.toBeInTheDocument()
  })

  it('marks an empty product Out of stock and blocks Sell with the reason', () => {
    renderAs('MANAGER', [{ ...product, currentStockUnits: 0, lowStockThreshold: 5 }])
    expect(within(card()).getByText('Out of stock')).toBeInTheDocument()
    expect(within(card()).queryByText('Low stock')).not.toBeInTheDocument()
    const sell = within(card()).getByRole('button', { name: 'Sell' })
    expect(sell).toBeDisabled()
    expect(sell).toHaveAccessibleDescription('Out of stock. Record a stock-in before selling.')
  })

  it('opens the stock delivery dialog for the card\'s product from a compact Stock in beside the primary Sell', async () => {
    const user = userEvent.setup()
    renderAs('MANAGER')
    const stockIn = within(card()).getByRole('button', { name: `Stock in for ${TITLE}` })
    expect(stockIn).toHaveTextContent('Stock in')
    expect(stockIn).toHaveClass('ui-btn-compact', 'ui-btn-secondary')
    expect(within(card()).getByRole('button', { name: 'Sell' })).toHaveClass('ui-btn-primary')
    await user.click(stockIn)
    expect(await screen.findByRole('dialog', { name: 'Record stock delivery' })).toBeInTheDocument()
  })

  it('blocks Sell and Stock in on a disabled product', () => {
    renderAs('MANAGER', [{ ...product, status: 'INACTIVE' }])
    expect(within(card()).getByRole('button', { name: 'Sell' })).toHaveAccessibleDescription('This product is disabled. Enable it to sell or stock in.')
    expect(within(card()).getByRole('button', { name: `Stock in for ${TITLE}` })).toBeDisabled()
  })
})

describe('ProductsTab sold today', () => {
  it('shows the units and amount sold today', () => {
    renderAs('OPERATOR', [{ ...product, soldTodayUnits: 3, soldTodayAmount: 750 }])
    expect(within(card()).getByText('Sold today: 3 · ₹750.00')).toBeInTheDocument()
  })

  it('says No sales today when nothing has sold', () => {
    renderAs('MANAGER')
    expect(within(card()).getByText('No sales today')).toBeInTheDocument()
  })
})

describe('ProductsTab card menu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists Inventory lots, Set price, Edit HSN with the current code, and Disable for an owner', async () => {
    const user = userEvent.setup()
    renderAs('OWNER')
    const menu = await openMenu(user)

    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Inventory lots'),
      expect.stringContaining('Set price'),
      expect.stringContaining('HSN 2710'),
      expect.stringContaining('Disable'),
    ])
  })

  it('gives a manager only Inventory lots', async () => {
    const user = userEvent.setup()
    renderAs('MANAGER')
    const menu = await openMenu(user)
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    expect(within(menu).getByRole('menuitem', { name: /Inventory lots/ })).toBeInTheDocument()
  })

  it('asks before disabling a product, and disables it only on confirm', async () => {
    const user = userEvent.setup()
    vi.mocked(ancillaryApi.setProductStatus).mockResolvedValue(undefined as never)
    renderAs('OWNER')

    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Disable/ }))
    const panel = within(card()).getByRole('region', { name: 'Disable this product?' })
    expect(ancillaryApi.setProductStatus).not.toHaveBeenCalled()

    await user.click(within(panel).getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(ancillaryApi.setProductStatus).toHaveBeenCalledWith(1, 1, 'INACTIVE'))
  })

  it('closes the disable question on Cancel without disabling', async () => {
    const user = userEvent.setup()
    renderAs('OWNER')

    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Disable/ }))
    await user.click(within(card()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('region', { name: 'Disable this product?' })).not.toBeInTheDocument()
    expect(ancillaryApi.setProductStatus).not.toHaveBeenCalled()
  })

  it('enables a disabled product straight from the menu', async () => {
    const user = userEvent.setup()
    vi.mocked(ancillaryApi.setProductStatus).mockResolvedValue(undefined as never)
    renderAs('OWNER', [{ ...product, status: 'INACTIVE' }])

    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Enable/ }))
    await waitFor(() => expect(ancillaryApi.setProductStatus).toHaveBeenCalledWith(1, 1, 'ACTIVE'))
  })

  it('sets a new price from the menu, showing the change and the price history', async () => {
    vi.mocked(ancillaryApi.getPriceHistory).mockResolvedValue([
      { id: 2, productId: 1, pumpId: 1, pricePerUnit: 450, effectiveFrom: '2026-05-02T06:30:00Z', setByUserId: 5 },
      { id: 1, productId: 1, pumpId: 1, pricePerUnit: 400, effectiveFrom: '2026-04-01T06:30:00Z', setByUserId: 5 },
    ])
    vi.mocked(ancillaryApi.setPrice).mockResolvedValue(
      { id: 3, productId: 1, pumpId: 1, pricePerUnit: 475, effectiveFrom: '2026-06-01T06:30:00Z', setByUserId: 5 })
    const user = userEvent.setup()
    const { queryClient } = renderAs('OWNER')
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await user.click(within(await openMenu(user)).getByRole('menuitem', { name: /Set price/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Set selling price' })
    const history = await within(dialog).findByRole('region', { name: 'Price history' })
    expect(await within(history).findAllByRole('listitem')).toHaveLength(2)
    expect(within(history).getAllByRole('listitem').map(row => row.textContent)).toEqual([
      expect.stringContaining('₹450.00'),
      expect.stringContaining('₹400.00'),
    ])

    await user.type(within(dialog).getByLabelText('New price per unit'), '475')
    expect(within(dialog).getByText('Up ₹25.00 from ₹450.00')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save price' }))

    await waitFor(() => expect(ancillaryApi.setPrice).toHaveBeenCalledWith(1, 1, { pricePerUnit: 475 }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Set selling price' })).not.toBeInTheDocument())
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ancillaryProducts', 1] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['ancillary-price-history', 1, 1] })
  })
})

describe('ProductsTab filters and sort', () => {
  const products: AncillaryProduct[] = [
    { ...product, id: 1, name: 'Brake Fluid', brand: null, currentStockUnits: 2, lowStockThreshold: 5, createdAt: '2026-01-01T00:00:00Z' },
    { ...product, id: 2, name: 'Coolant', brand: null, currentStockUnits: 10, currentSellingPricePerUnit: null, createdAt: '2026-02-01T00:00:00Z' },
    { ...product, id: 3, name: 'Engine Oil', brand: null, currentStockUnits: 0, status: 'INACTIVE', createdAt: '2026-03-01T00:00:00Z' },
    { ...product, id: 4, name: 'Air Freshener', brand: null, currentStockUnits: 20, createdAt: '2026-04-01T00:00:00Z' },
  ]

  it('counts each chip and narrows the cards to the chosen one', async () => {
    const user = userEvent.setup()
    renderAs('OWNER', products)

    expect(screen.getByRole('button', { name: 'All 4' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Low stock 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No price 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disabled 1' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Low stock 1' }))
    expect(cardNames()).toEqual(['Brake Fluid'])
    await user.click(screen.getByRole('button', { name: 'No price 1' }))
    expect(cardNames()).toEqual(['Coolant'])
    await user.click(screen.getByRole('button', { name: 'Disabled 1' }))
    expect(cardNames()).toEqual(['Engine Oil'])
  })

  it('sorts by name, by stock low to high, or newest first', async () => {
    const user = userEvent.setup()
    renderAs('OWNER', products)

    expect(cardNames()).toEqual(['Air Freshener', 'Brake Fluid', 'Coolant', 'Engine Oil'])
    await user.selectOptions(screen.getByLabelText('Sort'), 'Stock: low to high')
    expect(cardNames()).toEqual(['Engine Oil', 'Brake Fluid', 'Coolant', 'Air Freshener'])
    await user.selectOptions(screen.getByLabelText('Sort'), 'Recently added')
    expect(cardNames()).toEqual(['Air Freshener', 'Engine Oil', 'Coolant', 'Brake Fluid'])
  })

  it('searches by name, and offers Clear filters when nothing matches', async () => {
    const user = userEvent.setup()
    renderAs('OWNER', products)

    await user.type(screen.getByRole('searchbox', { name: 'Search products' }), 'cool')
    await waitFor(() => expect(cardNames()).toEqual(['Coolant']))

    await user.click(screen.getByRole('button', { name: 'Disabled 1' }))
    expect(await screen.findByText('No products match your search or filters')).toBeInTheDocument()
    await user.click(within(screen.getByText('No products match your search or filters').parentElement!).getByRole('button', { name: 'Clear filters' }))
    expect(cardNames()).toHaveLength(4)
  })
})
