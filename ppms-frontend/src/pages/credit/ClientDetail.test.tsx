import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditApi } from '../../api/creditApi'
import type { CreditClient, CreditPayment, CreditTransaction } from '../../api/creditApi'
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
    deleteInterestCharge: vi.fn(),
  },
}))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn().mockResolvedValue([]) } }))

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
  type: 'PAYMENT', referenceId: PAYMENT_ID, reference: 'UPI', detail: null, amount: 2_000,
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
    expect(creditApi.approvePayment).toHaveBeenCalledWith(PUMP_ID, PAYMENT_ID, 'APPROVED')
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
    await user.click(screen.getByRole('button', { name: /Record Payment/ }))
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

  it('lets a manager record payments and edit interest settings but not grant extensions', async () => {
    signIn('MANAGER', 1)
    await renderClient()
    expect(screen.getByRole('button', { name: 'Record Payment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Interest Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Grant Extension' })).not.toBeInTheDocument()
  })

  it('shows an accountant no write actions', async () => {
    signIn('ACCOUNTANT', 1)
    await renderClient()
    expect(screen.queryByRole('button', { name: 'Record Payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Interest Settings' })).not.toBeInTheDocument()
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
    expect(screen.queryByText('↓ Paid')).not.toBeInTheDocument()
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
