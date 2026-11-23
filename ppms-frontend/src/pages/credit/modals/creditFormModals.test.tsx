import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creditApi } from '../../../api/creditApi'
import type { CreditClient } from '../../../api/creditApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { RecordPaymentModal } from './RecordPaymentModal'
import { SetCreditLimitModal } from './SetCreditLimitModal'
import { SetInterestSettingsModal } from './SetInterestSettingsModal'
import { GrantExtensionModal } from './GrantExtensionModal'

vi.mock('../../../api/creditApi', () => ({
  creditApi: {
    recordPayment: vi.fn(),
    updateCreditLimit: vi.fn(),
    updateInterestSettings: vi.fn(),
    createExtension: vi.fn(),
  },
}))

const PUMP_ID = 3
const client: CreditClient = {
  id: 40, pumpId: PUMP_ID, name: 'Acme Transport', phone: '9876543210', notes: null,
  creditLimit: 50_000, outstandingBalance: 12_000, outstandingInterest: 0, totalInterestRecovered: 0,
  monthlyInterestRate: 0, interestGraceDays: 1, createdAt: '2026-01-01T00:00:00Z',
  parentClientId: null, parentClientName: null, isParent: false,
}

function figures(name: string) {
  return within(screen.getByLabelText(name))
}

describe('RecordPaymentModal', () => {
  beforeEach(() => {
    vi.mocked(creditApi.recordPayment).mockResolvedValue({} as never)
  })

  it('shows the balance after the payment as the amount is typed, and a dash before', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RecordPaymentModal client={client} pumpId={PUMP_ID} onClose={vi.fn()} />)

    const after = figures('After this payment')
    expect(after.getByText('₹12,000.00')).toBeInTheDocument()
    expect(after.getAllByText('—')).toHaveLength(2)

    await user.type(screen.getByLabelText('Amount'), '2500')

    expect(after.getByText('₹2,500.00')).toBeInTheDocument()
    expect(after.getByText('Balance after payment').nextSibling).toHaveTextContent('₹9,500.00')
  })

  it('says how much a payment is over the outstanding balance and refuses it next to the field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RecordPaymentModal client={client} pumpId={PUMP_ID} onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Amount'), '12500')
    expect(figures('After this payment').getByText('More than owed by').nextSibling).toHaveTextContent('₹500.00')

    await user.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(screen.getByLabelText('Amount')).toHaveAccessibleDescription(/cannot exceed outstanding balance/)
    expect(creditApi.recordPayment).not.toHaveBeenCalled()
  })

  it('keeps Record payment disabled until an amount is entered and says what is missing', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RecordPaymentModal client={client} pumpId={PUMP_ID} onClose={vi.fn()} />)

    const submit = screen.getByRole('button', { name: 'Record payment' })
    expect(submit).toBeDisabled()
    expect(submit).toHaveAccessibleDescription('Still needed Amount')

    await user.type(screen.getByLabelText('Amount'), '1000')
    expect(submit).toBeEnabled()
    expect(submit).not.toHaveAccessibleDescription()
    await user.click(submit)

    expect(creditApi.recordPayment).toHaveBeenCalledWith(PUMP_ID, client.id, expect.objectContaining({ amount: 1000, paymentMode: 'CASH' }))
  })
})

describe('SetCreditLimitModal', () => {
  beforeEach(() => {
    vi.mocked(creditApi.updateCreditLimit).mockResolvedValue({} as never)
  })

  it('works out the credit left under the new limit as it is typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SetCreditLimitModal client={client} pumpId={PUMP_ID} onClose={vi.fn()} />)

    const effect = figures('Effect of the new limit')
    expect(effect.getByText('Credit left').nextSibling).toHaveTextContent('₹38,000.00')

    const limit = screen.getByLabelText('Credit limit')
    await user.clear(limit)
    await user.type(limit, '10000')

    expect(effect.getByText('Over the new limit by').nextSibling).toHaveTextContent('₹2,000.00')
  })

  it('reads 0 as no limit', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SetCreditLimitModal client={client} pumpId={PUMP_ID} onClose={vi.fn()} />)

    const limit = screen.getByLabelText('Credit limit')
    await user.clear(limit)
    await user.type(limit, '0')

    const effect = figures('Effect of the new limit')
    expect(effect.getByText('New limit').nextSibling).toHaveTextContent('No limit')
    expect(effect.getByText('Credit left').nextSibling).toHaveTextContent('No limit')

    await user.click(screen.getByRole('button', { name: 'Save limit' }))
    expect(creditApi.updateCreditLimit).toHaveBeenCalledWith(PUMP_ID, client.id, { creditLimit: 0 })
  })
})

describe('SetInterestSettingsModal', () => {
  it('shows what 30 days of interest would be on the current balance at the typed rate', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SetInterestSettingsModal client={client} pumpId={PUMP_ID} onClose={vi.fn()} />)

    const example = figures("Example on today's balance")
    expect(example.getByText('Interest for 30 days').nextSibling).toHaveTextContent('—')

    await user.type(screen.getByLabelText('Monthly interest rate'), '1.5')

    expect(example.getByText('Interest for 30 days').nextSibling).toHaveTextContent('₹180.00')
  })
})

describe('GrantExtensionModal', () => {
  beforeEach(() => {
    vi.mocked(creditApi.createExtension).mockResolvedValue({} as never)
  })

  it('lists the missing fields beside the disabled button', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GrantExtensionModal client={client} pumpId={PUMP_ID} onClose={vi.fn()} />)

    const submit = screen.getByRole('button', { name: 'Grant extension' })
    expect(submit).toBeDisabled()
    expect(submit).toHaveAccessibleDescription('Still needed Reason')

    await user.type(screen.getByLabelText('Reason'), 'Festival season')
    expect(submit).toBeEnabled()
  })

  it('shows the limit while an amount extension runs', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GrantExtensionModal client={client} pumpId={PUMP_ID} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Extension type/ }))
    await user.click(screen.getByRole('option', { name: 'Extra credit amount' }))
    expect(screen.getByRole('button', { name: 'Grant extension' })).toHaveAccessibleDescription('Still needed Extra credit amount Reason')

    await user.type(screen.getByRole('spinbutton', { name: 'Extra credit amount' }), '5000')

    const limits = figures('Limit while the extension runs')
    expect(limits.getByText('Current limit').nextSibling).toHaveTextContent('₹50,000.00')
    expect(limits.getByText(/^Limit until/).nextSibling).toHaveTextContent('₹55,000.00')
  })
})
