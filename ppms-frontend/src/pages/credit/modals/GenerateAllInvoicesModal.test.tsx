import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditApi } from '../../../api/creditApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { GenerateAllInvoicesModal } from './GenerateAllInvoicesModal'

vi.mock('../../../api/creditApi', () => ({
  creditApi: { previewInvoicesForAllClients: vi.fn(), generateInvoicesForAllClients: vi.fn() },
}))

describe('GenerateAllInvoicesModal', () => {
  beforeEach(() => {
    vi.mocked(creditApi.generateInvoicesForAllClients).mockReset()
  })

  it('previews how many clients and how much would be invoiced before generating', async () => {
    const user = userEvent.setup()
    vi.mocked(creditApi.previewInvoicesForAllClients).mockResolvedValue({
      clientsToInvoice: 4, totalAmount: 86250.5, gstDetailsComplete: true,
    })
    vi.mocked(creditApi.generateInvoicesForAllClients).mockResolvedValue({
      invoicesIssued: 4, clientsSkipped: 2, clientsFailed: 0, failedClientIds: [],
    })
    renderWithProviders(<GenerateAllInvoicesModal pumpId={3} onClose={vi.fn()} />)

    expect(await screen.findByText('₹86,250.50')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('4 clients would be invoiced for ₹86,250.50 in total.')
    expect(creditApi.generateInvoicesForAllClients).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Generate 4 invoices' }))

    expect(creditApi.generateInvoicesForAllClients).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/invoices issued/)).toBeInTheDocument()
  })

  it('blocks generating and links to Setup when the pump has no GST details', async () => {
    vi.mocked(creditApi.previewInvoicesForAllClients).mockResolvedValue({
      clientsToInvoice: 2, totalAmount: 900, gstDetailsComplete: false,
    })
    renderWithProviders(<GenerateAllInvoicesModal pumpId={3} onClose={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent("Add the pump's GST details before issuing invoices.")
    expect(screen.getByRole('link', { name: 'Open Setup → GST details' })).toHaveAttribute('href', '/dashboard/setup')
    expect(screen.getByRole('button', { name: 'Generate 2 invoices' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Generate 2 invoices' })).toHaveAccessibleDescription(/Add the pump's GST details/)
  })

  it('cannot generate when nothing would be invoiced', async () => {
    vi.mocked(creditApi.previewInvoicesForAllClients).mockResolvedValue({
      clientsToInvoice: 0, totalAmount: 0, gstDetailsComplete: true,
    })
    renderWithProviders(<GenerateAllInvoicesModal pumpId={3} onClose={vi.fn()} />)

    expect(await screen.findByText('No client has uninvoiced credit sales in this period.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Generate' })).toHaveAccessibleDescription('No client has uninvoiced credit sales in this period.')
  })
})
