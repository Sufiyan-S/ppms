import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditApi } from '../../api/creditApi'
import type { CreditInvoice } from '../../api/creditApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { PagedResponse } from '../../types/paged'
import { ClientInvoicesTab } from './ClientInvoicesTab'

vi.mock('../../api/creditApi', () => ({
  creditApi: {
    listInvoices: vi.fn(),
    getDefaultInvoicePeriod: vi.fn(),
    generateInvoice: vi.fn(),
    cancelInvoice: vi.fn(),
    invoicePrintUrl: (pumpId: number, invoiceId: number) => `/api/pumps/${pumpId}/credit-invoices/${invoiceId}/print`,
  },
}))

const PUMP_ID = 3
const CLIENT_ID = 40

const issued: CreditInvoice = {
  id: 7, pumpId: PUMP_ID, clientId: CLIENT_ID, invoiceNumber: 'PMP3/26-27/0002', financialYear: '2026-27',
  periodFrom: '2026-10-01', periodTo: '2026-10-31', issuedOn: '2026-11-02',
  sellerLegalName: 'Lakshmi Fuels', sellerGstin: '27AAAPL1234C1ZV', buyerName: 'Acme Transport', buyerGstin: null,
  placeOfSupplyStateCode: '27', fuelTotal: 1000, taxableTotal: 200, cgstTotal: 18, sgstTotal: 18, igstTotal: 0,
  grandTotal: 1236, status: 'ISSUED', cancelReason: null, cancelledAt: null, createdAt: '2026-11-02T05:00:00Z',
}
const cancelled: CreditInvoice = {
  ...issued, id: 6, invoiceNumber: 'PMP3/26-27/0001', status: 'CANCELLED', cancelReason: 'Wrong period',
  cancelledAt: '2026-11-02T04:00:00Z',
}

function page(content: CreditInvoice[]): PagedResponse<CreditInvoice> {
  return { content, page: 0, pageSize: 10, totalElements: content.length, totalPages: 1, hasNext: false, hasPrevious: false }
}

describe('ClientInvoicesTab', () => {
  beforeEach(() => {
    vi.mocked(creditApi.listInvoices).mockResolvedValue(page([issued, cancelled]))
    vi.mocked(creditApi.getDefaultInvoicePeriod).mockResolvedValue({ periodFrom: '2026-10-01', periodTo: '2026-10-31' })
    vi.mocked(creditApi.generateInvoice).mockResolvedValue({ ...issued, id: 8, invoiceNumber: 'PMP3/26-27/0003' })
    vi.mocked(creditApi.cancelInvoice).mockResolvedValue({ ...issued, status: 'CANCELLED' })
  })

  it('lists invoices with their status and a print link', async () => {
    renderWithProviders(<ClientInvoicesTab pumpId={PUMP_ID} clientId={CLIENT_ID} canIssueInvoices />)

    const list = await screen.findByRole('list', { name: 'Invoices' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('PMP3/26-27/0002')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Issued')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Cancelled')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Reason: Wrong period')).toBeInTheDocument()
    expect(within(rows[0]).getByRole('link', { name: 'View or print invoice PMP3/26-27/0002' }))
      .toHaveAttribute('href', `/api/pumps/${PUMP_ID}/credit-invoices/7/print`)
    expect(within(rows[1]).queryByRole('button', { name: /Cancel invoice/ })).not.toBeInTheDocument()
  })

  it('prefills the generate form with the last billing cycle and sends it', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ClientInvoicesTab pumpId={PUMP_ID} clientId={CLIENT_ID} canIssueInvoices />)

    const form = await screen.findByRole('form', { name: 'Generate invoice' })
    expect(within(form).getByLabelText('From')).toHaveValue('2026-10-01')
    expect(within(form).getByLabelText('To')).toHaveValue('2026-10-31')

    await user.click(within(form).getByRole('button', { name: 'Generate invoice' }))

    expect(creditApi.generateInvoice).toHaveBeenCalledWith(PUMP_ID, CLIENT_ID, { periodFrom: '2026-10-01', periodTo: '2026-10-31' })
  })

  it('needs a reason before cancelling an invoice', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ClientInvoicesTab pumpId={PUMP_ID} clientId={CLIENT_ID} canIssueInvoices />)

    await user.click(await screen.findByRole('button', { name: 'Cancel invoice PMP3/26-27/0002' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel invoice' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('A reason is required')
    expect(creditApi.cancelInvoice).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText(/Reason/), 'Issued for the wrong period')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel invoice' }))

    expect(creditApi.cancelInvoice).toHaveBeenCalledWith(PUMP_ID, 7, 'Issued for the wrong period')
  })

  it('shows only the list to a role that cannot issue invoices', async () => {
    renderWithProviders(<ClientInvoicesTab pumpId={PUMP_ID} clientId={CLIENT_ID} canIssueInvoices={false} />)

    await screen.findByRole('list', { name: 'Invoices' })
    expect(screen.queryByRole('form', { name: 'Generate invoice' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancel invoice/ })).not.toBeInTheDocument()
    expect(creditApi.getDefaultInvoicePeriod).not.toHaveBeenCalled()
  })

  it('shows the parties and GST totals of an invoice in a side panel, with print and cancel there too', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ClientInvoicesTab pumpId={PUMP_ID} clientId={CLIENT_ID} canIssueInvoices />)

    await user.click(await screen.findByRole('button', { name: 'Details of invoice PMP3/26-27/0002' }))

    const panel = screen.getByRole('dialog', { name: 'PMP3/26-27/0002' })
    expect(within(panel).getByText('Lakshmi Fuels')).toBeInTheDocument()
    expect(within(panel).getByText('Not registered')).toBeInTheDocument()
    expect(within(panel).getByText('₹1,236.00')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'View / Print' }))
      .toHaveAttribute('href', `/api/pumps/${PUMP_ID}/credit-invoices/7/print`)

    await user.click(within(panel).getByRole('button', { name: 'Cancel invoice' }))

    expect(screen.queryByRole('dialog', { name: 'PMP3/26-27/0002' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Cancel invoice' })).toBeInTheDocument()
  })
})
