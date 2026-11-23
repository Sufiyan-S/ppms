import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditApi } from '../../api/creditApi'
import type { CreditClient, CreditExtension, CreditPayment, CreditTransaction } from '../../api/creditApi'
import { useAuthStore } from '../../store/authStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { UserRole } from '../../types/auth'
import { ClientDetail } from './ClientDetail'

vi.mock('../../api/creditApi', () => ({
  creditApi: {
    getLedgerSummary: vi.fn(),
    getActiveExtensions: vi.fn(),
    getAllTransactions: vi.fn(),
    getPendingPayments: vi.fn(),
    approvePayment: vi.fn(),
    applyInterest: vi.fn(),
    waiveInterestCharge: vi.fn(),
    revokeExtension: vi.fn(),
  },
}))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClientAccounts: vi.fn().mockResolvedValue([]) } }))

const PUMP_ID = 3
const CLIENT_ID = 40
const PAYMENT_ID = 77
const RECORDER_ID = 5

const client: CreditClient = {
  id: CLIENT_ID, pumpId: PUMP_ID, name: 'Acme Transport', phone: '9876543210', notes: null,
  creditLimit: 50_000, outstandingBalance: 5_000, outstandingInterest: 0, totalInterestRecovered: 0,
  monthlyInterestRate: 0, interestGraceDays: 0, createdAt: '2026-01-01T00:00:00Z',
  parentClientId: null, parentClientName: null, isParent: false,
}

const pendingPayment: CreditTransaction = {
  type: 'PAYMENT', referenceId: PAYMENT_ID, reference: 'UPI', referenceCode: null, referenceParams: {}, detail: null, amount: 2_000,
  runningBalance: 5_000, occurredAt: '2026-03-15T06:00:00Z', businessDate: '2026-03-15', status: 'PENDING_APPROVAL', countedInBalance: false,
}

const pendingPaymentRecord = { id: PAYMENT_ID, recordedById: RECORDER_ID } as CreditPayment

function signIn(role: UserRole, userId: number) {
  useAuthStore.setState({ user: { userId, fullName: 'User', role, assignedPumpId: null }, isAuthenticated: true })
}

async function renderClient() {
  renderWithProviders(<ClientDetail clientId={CLIENT_ID} pumpId={PUMP_ID} onBack={vi.fn()} />)
  await screen.findByText('Acme Transport')
  await screen.findByText('Pending approval')
}

describe('ClientDetail pending payment approval', () => {
  beforeEach(() => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([client])
    vi.mocked(creditApi.getActiveExtensions).mockResolvedValue([])
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([pendingPayment])
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([pendingPaymentRecord])
    vi.mocked(creditApi.approvePayment).mockResolvedValue({} as CreditPayment)
  })

  it.each<UserRole>(['OWNER', 'ADMIN'])('lets %s approve or reject a payment someone else recorded', async (role) => {
    signIn(role, 1)
    await renderClient()
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('sends the approval for the payment', async () => {
    const user = userEvent.setup()
    signIn('OWNER', 1)
    await renderClient()
    await user.click(await screen.findByRole('button', { name: 'Approve' }))
    expect(creditApi.approvePayment).toHaveBeenCalledWith(PUMP_ID, PAYMENT_ID, 'APPROVED', undefined)
  })

  it('asks for a reason before rejecting the payment and sends it with the rejection', async () => {
    const user = userEvent.setup()
    signIn('OWNER', 1)
    await renderClient()
    await user.click(await screen.findByRole('button', { name: 'Reject' }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter a reason for rejecting.')
    expect(creditApi.approvePayment).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText(/Reason/), 'Cheque bounced')
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }))
    expect(creditApi.approvePayment).toHaveBeenCalledWith(PUMP_ID, PAYMENT_ID, 'REJECTED', 'Cheque bounced')
  })

  it('hides Approve and Reject from the user who recorded the payment', async () => {
    signIn('OWNER', RECORDER_ID)
    await renderClient()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('hides Approve and Reject while it is not yet known who recorded the payment', async () => {
    vi.mocked(creditApi.getPendingPayments).mockReturnValue(new Promise(() => {}))
    signIn('OWNER', RECORDER_ID)
    await renderClient()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it.each<UserRole>(['MANAGER', 'ACCOUNTANT'])('hides Approve and Reject from %s and does not load pending payments', async (role) => {
    signIn(role, 1)
    await renderClient()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(creditApi.getPendingPayments).not.toHaveBeenCalled()
  })

  it('leaves a pending payment out of the outstanding balance used for new payments', async () => {
    const user = userEvent.setup()
    signIn('OWNER', 1)
    await renderClient()
    await user.click(screen.getByRole('button', { name: /Record payment/ }))
    expect((await screen.findAllByText(/3,000\.00/)).length).toBeGreaterThan(0)
  })
})

describe('ClientDetail actions by role', () => {
  beforeEach(() => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([client])
    vi.mocked(creditApi.getActiveExtensions).mockResolvedValue([])
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([pendingPayment])
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([pendingPaymentRecord])
  })

  it('lets a manager record payments but not edit interest settings or grant extensions', async () => {
    signIn('MANAGER', 1)
    await renderClient()
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Interest settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Grant extension' })).not.toBeInTheDocument()
  })

  it('offers a sub-account no interest actions and points to the parent that is charged', async () => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([{
      ...client, monthlyInterestRate: 2, parentClientId: 39, parentClientName: 'Acme Group',
    }])
    signIn('OWNER', 1)
    await renderClient()
    expect(screen.queryByRole('button', { name: 'Interest settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply interest' })).not.toBeInTheDocument()
    expect(screen.getByText(/charged on the parent account \(Acme Group\)/)).toBeInTheDocument()
    expect(screen.getByText('Set on parent account')).toBeInTheDocument()
  })

  it('sends an owner to the parent account to grant an extension for a sub-account', async () => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([{
      ...client, parentClientId: 39, parentClientName: 'Acme Group',
    }])
    signIn('OWNER', 1)
    await renderClient()
    expect(screen.queryByRole('button', { name: 'Grant extension' })).not.toBeInTheDocument()
    expect(screen.getByText(/Grant credit extensions there/)).toBeInTheDocument()
  })

  it('lets an owner edit interest settings', async () => {
    signIn('OWNER', 1)
    await renderClient()
    expect(screen.getByRole('button', { name: 'Interest settings' })).toBeInTheDocument()
  })

  it('shows an accountant no write actions', async () => {
    signIn('ACCOUNTANT', 1)
    await renderClient()
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Interest settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })
})

describe('ClientDetail pending payment display', () => {
  beforeEach(() => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([client])
    vi.mocked(creditApi.getActiveExtensions).mockResolvedValue([])
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([pendingPayment])
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([])
    signIn('MANAGER', 1)
  })

  it('labels the payment as pending instead of paid and keeps the outstanding figure the list shows', async () => {
    await renderClient()
    expect(screen.queryByText('Paid')).not.toBeInTheDocument()
    expect(screen.queryByText(/PENDING_APPROVAL/)).not.toBeInTheDocument()
    expect(screen.getByText('Not counted in balance')).toBeInTheDocument()
    expect(screen.getAllByText('₹5,000.00').length).toBeGreaterThan(0)
    expect(screen.getByText('₹2,000.00 pending approval')).toBeInTheDocument()
  })
})

describe('ClientDetail when the client cannot be shown', () => {
  beforeEach(() => {
    vi.mocked(creditApi.getActiveExtensions).mockResolvedValue([])
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([])
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([])
    signIn('OWNER', 1)
  })

  it('says the client was not found instead of loading forever', async () => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([])
    renderWithProviders(<ClientDetail clientId={CLIENT_ID} pumpId={PUMP_ID} onBack={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('not found')
  })

  it('reports a failed load', async () => {
    vi.mocked(creditApi.getLedgerSummary).mockRejectedValue(new Error('boom'))
    renderWithProviders(<ClientDetail clientId={CLIENT_ID} pumpId={PUMP_ID} onBack={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this client')
  })
})

describe('ClientDetail interest waiver', () => {
  const interestCharge: CreditTransaction = {
    type: 'INTEREST', referenceId: 91, reference: '30 days @ 2.00%/month', referenceCode: 'INTEREST_CHARGE_DETAILS', referenceParams: { days: 30, rate: 2 }, detail: '2026-02-01 – 2026-03-02', amount: 100,
    runningBalance: 5_000, occurredAt: '2026-03-02T06:00:00Z', businessDate: '2026-03-02', status: 'ACTIVE', countedInBalance: true,
  }

  beforeEach(() => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([client])
    vi.mocked(creditApi.getActiveExtensions).mockResolvedValue([])
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([pendingPayment, interestCharge])
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([pendingPaymentRecord])
    vi.mocked(creditApi.waiveInterestCharge).mockResolvedValue({} as never)
  })

  it('asks the owner for a reason and sends it with the waiver', async () => {
    const user = userEvent.setup()
    signIn('OWNER', 1)
    await renderClient()

    await user.click(screen.getByRole('button', { name: 'Waive this interest charge' }))
    await user.click(screen.getByRole('button', { name: 'Waive interest' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A reason is required')
    expect(creditApi.waiveInterestCharge).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox'), 'Charged at the wrong rate')
    await user.click(screen.getByRole('button', { name: 'Waive interest' }))
    expect(creditApi.waiveInterestCharge).toHaveBeenCalledWith(PUMP_ID, CLIENT_ID, 91, 'Charged at the wrong rate')
  })

  it('does not offer a manager the waiver', async () => {
    signIn('MANAGER', 1)
    await renderClient()
    expect(screen.queryByRole('button', { name: 'Waive this interest charge' })).not.toBeInTheDocument()
  })
})

describe('ClientDetail extension revoke', () => {
  const extension: CreditExtension = {
    id: 55, pumpId: PUMP_ID, clientId: CLIENT_ID, extensionType: 'AMOUNT_EXTENSION', extensionAmount: 10_000,
    expiryDate: '2026-12-31', grantedByUserId: 1, reason: 'Festival season', status: 'ACTIVE', createdAt: '2026-11-01T00:00:00Z',
  }

  beforeEach(() => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([client])
    vi.mocked(creditApi.getActiveExtensions).mockResolvedValue([extension])
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([pendingPayment])
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([pendingPaymentRecord])
    vi.mocked(creditApi.revokeExtension).mockResolvedValue({ ...extension, status: 'REVOKED' })
  })

  it('asks the owner for a reason and sends it with the revocation', async () => {
    const user = userEvent.setup()
    signIn('OWNER', 1)
    await renderClient()

    await user.click(await screen.findByRole('button', { name: 'Revoke' }))
    await user.click(screen.getByRole('button', { name: 'Revoke extension' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A reason is required')
    expect(creditApi.revokeExtension).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox'), 'Missed the promised payment')
    await user.click(screen.getByRole('button', { name: 'Revoke extension' }))
    expect(creditApi.revokeExtension).toHaveBeenCalledWith(PUMP_ID, CLIENT_ID, 55, 'Missed the promised payment')
  })

  it('does not offer a manager the revoke button', async () => {
    signIn('MANAGER', 1)
    await renderClient()
    expect(await screen.findByText(/credit headroom/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
  })
})

describe('ClientDetail from the address', () => {
  beforeEach(() => {
    vi.mocked(creditApi.getLedgerSummary).mockResolvedValue([client])
    vi.mocked(creditApi.getActiveExtensions).mockResolvedValue([])
    vi.mocked(creditApi.getAllTransactions).mockResolvedValue([])
    vi.mocked(creditApi.getPendingPayments).mockResolvedValue([])
    signIn('MANAGER', 1)
  })

  it('opens Record payment from ?action=record-payment', async () => {
    renderWithProviders(<ClientDetail clientId={CLIENT_ID} pumpId={PUMP_ID} onBack={vi.fn()} />, { route: '/?action=record-payment' })

    const dialog = await screen.findByRole('dialog', { name: /Record payment/ })
    expect(within(dialog).getByText('Acme Transport')).toBeInTheDocument()
  })

  it('does not open Record payment for a role that cannot record payments', async () => {
    signIn('ACCOUNTANT', 1)
    renderWithProviders(<ClientDetail clientId={CLIENT_ID} pumpId={PUMP_ID} onBack={vi.fn()} />, { route: '/?action=record-payment' })

    await screen.findByText('Acme Transport')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers the ledger and invoices as tab links kept in the address', async () => {
    renderWithProviders(<ClientDetail clientId={CLIENT_ID} pumpId={PUMP_ID} onBack={vi.fn()} />)

    const tabs = await screen.findByRole('navigation', { name: 'Client records' })
    expect(within(tabs).getByRole('link', { name: 'Ledger' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Invoices' })).toHaveAttribute('href', '/?records=invoices')
  })
})
