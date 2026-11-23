import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { StockInDialog } from './StockInDialog'
import { BackfillSaleModal } from './BackfillSaleModal'

vi.mock('../../api/ancillaryApi', () => ({ ancillaryApi: { recordDelivery: vi.fn(), backfillSale: vi.fn() } }))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn().mockResolvedValue([]) } }))

const oil = {
  id: 8, pumpId: 3, name: 'Engine Oil', brand: null, variant: null, packageSize: 1, unitOfMeasure: 'LITRE',
  currentStockUnits: 7, lowStockThreshold: null, status: 'ACTIVE', fifoCostPricePerUnit: 100,
  activeFifoLots: [], displayName: 'Engine Oil 1L', createdAt: '', updatedAt: '',
} as AncillaryProduct

function figure(label: string | RegExp) {
  return screen.getByText(label).closest('div')?.querySelector('dd')
}

describe('StockInDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ancillaryApi.recordDelivery).mockResolvedValue({} as Awaited<ReturnType<typeof ancillaryApi.recordDelivery>>)
  })

  it('works out the total cost and the stock after delivery as quantity and cost are typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StockInDialog pumpId={3} products={[oil]} onClose={vi.fn()} onSuccess={vi.fn()} />)

    expect(figure(/^Total cost/)).toHaveTextContent('—')
    const qty = screen.getByLabelText('Quantity')
    await user.clear(qty)
    await user.type(qty, '12')
    await user.type(screen.getByLabelText('Cost price per unit'), '250')

    expect(screen.getByText('12 × ₹250.00')).toBeInTheDocument()
    expect(figure(/^Total cost/)).toHaveTextContent('₹3,000.00')
    expect(figure('Stock after delivery')).toHaveTextContent('19 units')
  })

  it('keeps Review disabled until the cost price is entered, then records the delivery from the review step', async () => {
    const user = userEvent.setup()
    renderWithProviders(<StockInDialog pumpId={3} products={[oil]} onClose={vi.fn()} onSuccess={vi.fn()} />)

    const review = screen.getByRole('button', { name: 'Review' })
    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription('Still needed Cost price')

    await user.type(screen.getByLabelText('Cost price per unit'), '250')
    await user.click(review)
    expect(await screen.findByRole('dialog', { name: 'Review stock delivery' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add stock' }))
    expect(ancillaryApi.recordDelivery).toHaveBeenCalledWith(3, 8, expect.objectContaining({ quantityUnits: 1, costPricePerUnit: 250 }))
  })
})

describe('BackfillSaleModal', () => {
  it('shows the stock left after the sale and asks for a credit client before review', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BackfillSaleModal pumpId={3} products={[oil]} onClose={vi.fn()} onSuccess={vi.fn()} />)

    const qty = screen.getByLabelText('Quantity')
    await user.clear(qty)
    await user.type(qty, '3')
    expect(figure('Stock after sale')).toHaveTextContent('4 units')

    await user.click(screen.getByRole('button', { name: /Payment mode/ }))
    await user.click(await screen.findByRole('option', { name: 'Credit' }))
    expect(screen.getByRole('button', { name: 'Review' })).toHaveAccessibleDescription('Still needed Credit client')
  })
})
