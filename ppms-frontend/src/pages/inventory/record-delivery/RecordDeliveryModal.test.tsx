import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '../../../api/inventoryApi'
import type { TankStock } from '../../../api/inventoryApi'
import { tankerApi } from '../../../api/tankerApi'
import { useToastStore } from '../../../store/toastStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { RecordDeliveryModal } from './RecordDeliveryModal'

vi.mock('../../../api/inventoryApi', () => ({ inventoryApi: { recordBatchDelivery: vi.fn() } }))
vi.mock('../../../api/tankerApi', () => ({ tankerApi: { getTankers: vi.fn() } }))

const tank: TankStock = {
  tankId: 1, tankIdentifier: 'T1', fuelType: 'PETROL', capacity: 10_000, currentStock: 1_000,
  stockPercentage: 10, lowStock: true, dipTolerance: 50, pumpId: 6,
}

function figure(label: string | RegExp) {
  return screen.getAllByText(label, { selector: 'dt' })[0].nextElementSibling as HTMLElement
}

describe('RecordDeliveryModal', () => {
  beforeEach(() => {
    vi.mocked(tankerApi.getTankers).mockResolvedValue([])
    vi.mocked(inventoryApi.recordBatchDelivery).mockResolvedValue({} as never)
    useToastStore.setState({ toasts: [] })
  })

  it('confirms with a message once the tanker delivery is recorded', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <RecordDeliveryModal pumpId={6} tanks={[tank]} isOwnerOrAdmin={false} canSetBillTotal={false} onClose={onClose} />,
    )

    await user.type(screen.getByLabelText('Invoice / bill no.'), 'INV-1')
    await user.type(screen.getByLabelText('Quantity received'), '5000')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm delivery' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ message: 'Tanker delivery recorded', variant: 'success' }),
    ])
  })

  it('works out the amount, the stock after delivery and the other charges as figures are typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <RecordDeliveryModal pumpId={6} tanks={[tank]} isOwnerOrAdmin canSetBillTotal onClose={vi.fn()} />,
    )

    expect(figure('Amount (litres × rate)')).toHaveTextContent('—')
    await user.type(screen.getByLabelText('Quantity received'), '1000')
    await user.type(screen.getByLabelText('Cost per litre'), '90')

    expect(figure('Amount (litres × rate)')).toHaveTextContent('₹90,000.00')
    expect(figure('Stock after delivery')).toHaveTextContent('2,000.0 L')
    expect(figure('Total received')).toHaveTextContent('1,000.0 L')
    expect(screen.getByLabelText('Bill amount')).toHaveValue(90000)

    await user.clear(screen.getByLabelText('Bill amount'))
    await user.type(screen.getByLabelText('Bill amount'), '91500')
    expect(figure(/Other charges/)).toHaveTextContent('+₹1,500.00')
  })

  it('keeps Review unavailable and says why while a tank would overflow', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <RecordDeliveryModal pumpId={6} tanks={[tank]} isOwnerOrAdmin={false} canSetBillTotal={false} onClose={vi.fn()} />,
    )

    await user.type(screen.getByLabelText('Quantity received'), '9500')

    expect(screen.getByLabelText('Quantity received')).toHaveAccessibleDescription('More than the free space of 9,000.0 L')
    const review = screen.getByRole('button', { name: 'Review' })
    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription(/Still needed\s*One or more tank quantities exceed available capacity/)
  })

  it('reviews the totals and tank lines with the bill number in the header', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <RecordDeliveryModal pumpId={6} tanks={[tank]} isOwnerOrAdmin canSetBillTotal={false} onClose={vi.fn()} />,
    )

    await user.type(screen.getByLabelText('Invoice / bill no.'), 'INV-7')
    await user.type(screen.getByLabelText('Quantity received'), '1000')
    await user.type(screen.getByLabelText('Cost per litre'), '90')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    const review = await screen.findByRole('dialog', { name: 'Review tanker delivery' })
    expect(review).toHaveTextContent('Bill no. INV-7')
    expect(within(review).getByText('Total received').nextElementSibling).toHaveTextContent('1,000.0 L')
    expect(within(review).getByText('Calculated amount').nextElementSibling).toHaveTextContent('₹90,000.00')

    await user.click(within(review).getByRole('button', { name: 'Edit' }))
    expect(screen.queryByRole('dialog', { name: 'Review tanker delivery' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Quantity received')).toHaveValue(1000)
  })
})
