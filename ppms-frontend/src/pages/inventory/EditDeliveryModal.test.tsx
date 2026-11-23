import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankerDelivery } from '../../api/inventoryApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { EditDeliveryModal } from './EditDeliveryModal'

vi.mock('../../api/inventoryApi', () => ({ inventoryApi: { updateDelivery: vi.fn() } }))

const delivery = {
  id: 3, tankId: 1, tankIdentifier: 'T1', fuelType: 'PETROL', invoiceReference: 'INV-1',
  quantityDelivered: 1000, costPricePerUnit: 90, totalCost: 90_000, deliveryDate: '2026-11-20T00:00:00',
} as TankerDelivery

function figure(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement
}

describe('EditDeliveryModal', () => {
  beforeEach(() => {
    vi.mocked(inventoryApi.updateDelivery).mockResolvedValue({} as never)
  })

  it('shows the amount before and after the change as the quantity is edited', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EditDeliveryModal delivery={delivery} pumpId={6} isOwnerOrAdmin onClose={vi.fn()} />)

    expect(figure('Amount now')).toHaveTextContent('₹90,000.00')
    expect(figure('Amount after this change')).toHaveTextContent('₹90,000.00')

    await user.clear(screen.getByLabelText('Quantity'))
    await user.type(screen.getByLabelText('Quantity'), '1200')
    expect(figure('Amount after this change')).toHaveTextContent('₹1,08,000.00')

    await user.clear(screen.getByLabelText('Quantity'))
    expect(figure('Amount after this change')).toHaveTextContent('—')
  })

  it('says what is wrong under the field and sends nothing', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EditDeliveryModal delivery={delivery} pumpId={6} isOwnerOrAdmin onClose={vi.fn()} />)

    await user.clear(screen.getByLabelText('Invoice / bill no.'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(screen.getByLabelText('Invoice / bill no.')).toHaveAccessibleDescription('Invoice reference is required.')
    expect(inventoryApi.updateDelivery).not.toHaveBeenCalled()
  })

  it('hides cost and amount from a manager', () => {
    renderWithProviders(<EditDeliveryModal delivery={delivery} pumpId={6} isOwnerOrAdmin={false} onClose={vi.fn()} />)

    expect(screen.queryByLabelText('Cost per litre')).not.toBeInTheDocument()
    expect(screen.queryByText('Amount now')).not.toBeInTheDocument()
  })
})
