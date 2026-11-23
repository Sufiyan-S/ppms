import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ancillaryApi } from '../../api/ancillaryApi'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient } from '../../api/pumpApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import { SellDialog } from './SellDialog'

vi.mock('../../api/ancillaryApi', () => ({ ancillaryApi: { getPriceHistory: vi.fn(), recordSale: vi.fn() } }))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn().mockResolvedValue([]) } }))

function product(lots: AncillaryProduct['activeFifoLots']): AncillaryProduct {
  return {
    id: 8, pumpId: 3, name: 'Engine Oil', brand: null, variant: null, packageSize: 1, unitOfMeasure: 'LITRE',
    currentStockUnits: 7, lowStockThreshold: null, status: 'ACTIVE', fifoCostPricePerUnit: lots[0]?.costPricePerUnit ?? null,
    activeFifoLots: lots, displayName: 'Engine Oil 1L', createdAt: '', updatedAt: '',
  }
}

/** The value shown beside a live figure's label. */
function figure(label: string | RegExp) {
  return screen.getByText(label).closest('div')?.querySelector('dd')
}

async function sell(lots: AncillaryProduct['activeFifoLots'], quantity: string) {
  const user = userEvent.setup()
  renderWithProviders(<SellDialog pumpId={3} product={product(lots)} onClose={vi.fn()} onSuccess={vi.fn()} />)
  await screen.findByDisplayValue('120')
  const qty = screen.getByLabelText('Quantity')
  await user.clear(qty)
  await user.type(qty, quantity)
  return user
}

describe('SellDialog projected profit', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Manager', role: 'MANAGER', assignedPumpId: 3 }, isAuthenticated: true })
    vi.mocked(ancillaryApi.getPriceHistory).mockResolvedValue([
      { id: 1, productId: 8, pumpId: 3, pricePerUnit: 120, effectiveFrom: '2026-01-01T00:00:00Z', setByUserId: 1 },
    ])
  })

  it('walks FIFO lots so a sale spanning two batches uses each batch cost', async () => {
    await sell([{ remainingQuantity: 5, costPricePerUnit: 100 }, { remainingQuantity: 2, costPricePerUnit: 200 }], '6')
    expect(figure('Projected profit')).toHaveTextContent('+₹20.00')
  })

  it('shows a projected loss when later batches cost more than the price', async () => {
    await sell([{ remainingQuantity: 1, costPricePerUnit: 100 }, { remainingQuantity: 5, costPricePerUnit: 200 }], '3')
    expect(figure('Projected loss')).toHaveTextContent('−₹140.00')
  })

  it('shows break-even when the price equals the cost', async () => {
    await sell([{ remainingQuantity: 5, costPricePerUnit: 120 }], '2')
    expect(figure('Break-even')).toHaveTextContent('₹0.00')
  })

  it('shows no projection when the lots cannot cover the quantity', async () => {
    await sell([{ remainingQuantity: 2, costPricePerUnit: 100 }], '3')
    expect(screen.queryByText(/Projected|Break-even/)).not.toBeInTheDocument()
  })

  it('hides the projection from an operator, who must not see cost prices', async () => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Op', role: 'OPERATOR', assignedPumpId: 3 }, isAuthenticated: true })
    await sell([{ remainingQuantity: 5, costPricePerUnit: 100 }], '2')
    expect(screen.queryByText(/Projected|Break-even/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Buy price/)).not.toBeInTheDocument()
  })

  it('shows no projection without lot data', async () => {
    await sell([], '1')
    expect(screen.queryByText(/Projected|Break-even/)).not.toBeInTheDocument()
  })
})

describe('SellDialog live total', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Manager', role: 'MANAGER', assignedPumpId: 3 }, isAuthenticated: true })
    vi.mocked(ancillaryApi.getPriceHistory).mockResolvedValue([
      { id: 1, productId: 8, pumpId: 3, pricePerUnit: 120, effectiveFrom: '2026-01-01T00:00:00Z', setByUserId: 1 },
    ])
  })

  it('works out quantity × price and the stock left as the quantity is typed', async () => {
    await sell([{ remainingQuantity: 7, costPricePerUnit: 100 }], '3')
    expect(screen.getByText('3 × ₹120.00')).toBeInTheDocument()
    expect(figure(/^Total/)).toHaveTextContent('₹360.00')
    expect(figure('Stock after sale')).toHaveTextContent('4 units')
  })

  it('shows a dash for the total and stock until a quantity is entered', async () => {
    const user = await sell([{ remainingQuantity: 7, costPricePerUnit: 100 }], '1')
    await user.clear(screen.getByLabelText('Quantity'))
    expect(figure(/^Total/)).toHaveTextContent('—')
    expect(figure('Stock after sale')).toHaveTextContent('—')
    expect(screen.getByRole('button', { name: 'Review' })).toHaveAccessibleDescription('Still needed Quantity')
  })

  it('keeps Review disabled and says a price is needed when the product has no selling price', async () => {
    vi.mocked(ancillaryApi.getPriceHistory).mockResolvedValue([])
    renderWithProviders(<SellDialog pumpId={3} product={product([])} onClose={vi.fn()} onSuccess={vi.fn()} />)

    expect(await screen.findByText('No selling price is set for this product. Set a price first.')).toBeInTheDocument()
    const review = screen.getByRole('button', { name: 'Review' })
    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription('Still needed A selling price for this product')
  })
})

describe('SellDialog credit sale', () => {
  const acme = { id: 41, pumpId: 3, name: 'Acme Transport', phone: null, notes: null, createdAt: '', parentClientId: null, parentClientName: null, isParent: false } as CreditClient

  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Manager', role: 'MANAGER', assignedPumpId: 3 }, isAuthenticated: true })
    vi.mocked(ancillaryApi.getPriceHistory).mockResolvedValue([
      { id: 1, productId: 8, pumpId: 3, pricePerUnit: 120, effectiveFrom: '2026-01-01T00:00:00Z', setByUserId: 1 },
    ])
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([acme])
    vi.mocked(ancillaryApi.recordSale).mockResolvedValue({} as Awaited<ReturnType<typeof ancillaryApi.recordSale>>)
  })

  it('lets a manager pick a credit client from the pump client list and refreshes the credit ledger after the sale', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderWithProviders(<SellDialog pumpId={3} product={product([{ remainingQuantity: 5, costPricePerUnit: 100 }])} onClose={vi.fn()} onSuccess={vi.fn()} />)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await screen.findByDisplayValue('120')

    await user.click(screen.getByRole('button', { name: /Payment mode/i }))
    await user.click(await screen.findByRole('option', { name: 'Credit' }))
    expect(screen.getByRole('button', { name: 'Review' })).toHaveAccessibleDescription('Still needed Credit client')
    await user.click(await screen.findByRole('button', { name: /^Client/ }))
    await user.click(await screen.findByRole('option', { name: 'Acme Transport' }))

    expect(pumpApi.getCreditClients).toHaveBeenCalledWith(3)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('dialog', { name: 'Review sale' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record sale' }))

    await vi.waitFor(() => expect(ancillaryApi.recordSale).toHaveBeenCalledWith(3, expect.objectContaining({ paymentMode: 'CREDIT', clientId: 41 })))
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['credit-ledger', 3] }))
  })
})
