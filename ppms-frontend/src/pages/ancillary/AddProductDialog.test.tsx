import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { AddProductDialog } from './AddProductDialog'

vi.mock('../../api/ancillaryApi', () => ({ ancillaryApi: { createProduct: vi.fn() } }))

describe('AddProductDialog HSN code', () => {
  beforeEach(() => {
    vi.mocked(ancillaryApi.createProduct).mockResolvedValue({} as AncillaryProduct)
  })

  it('sends the HSN code with the new product', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddProductDialog pumpId={3} onClose={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText('Product name'), 'Engine Oil')
    await user.type(screen.getByLabelText(/^HSN code/), '2710 1980')
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.getByText('27101980')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add product' }))

    expect(ancillaryApi.createProduct).toHaveBeenCalledWith(3, expect.objectContaining({ hsnCode: '27101980' }))
  })

  it('refuses an HSN code shorter than 4 digits', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddProductDialog pumpId={3} onClose={vi.fn()} onSuccess={vi.fn()} />)

    await user.type(screen.getByLabelText('Product name'), 'Engine Oil')
    await user.type(screen.getByLabelText(/^HSN code/), '271')
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByRole('alert')).toHaveTextContent('HSN code must be 4 to 8 digits')
    expect(screen.getByLabelText(/^HSN code/)).toHaveAccessibleDescription('HSN code must be 4 to 8 digits')
  })
})

describe('AddProductDialog required fields', () => {
  it('keeps Review disabled and says the product name is still needed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AddProductDialog pumpId={3} onClose={vi.fn()} onSuccess={vi.fn()} />)

    const review = screen.getByRole('button', { name: 'Review' })
    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription('Still needed Product name')

    await user.type(screen.getByLabelText('Product name'), 'Engine Oil')
    expect(review).toBeEnabled()
  })
})
