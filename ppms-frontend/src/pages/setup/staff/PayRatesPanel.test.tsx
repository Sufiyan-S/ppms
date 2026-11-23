import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userApi } from '../../../api/userApi'
import type { StaffMember } from '../../../api/userApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { PayRatesPanel } from './PayRatesPanel'

vi.mock('../../../api/userApi', () => ({
  userApi: { updatePayRates: vi.fn() },
}))

const operator = {
  id: 11, fullName: 'Ravi Kumar', role: 'OPERATOR', shift1HourlyRate: null, standardHourlyRate: null, dailyRate: null,
} as StaffMember
const manager = { ...operator, id: 12, fullName: 'Sunita Rao', role: 'MANAGER' } as StaffMember

function examplePay() {
  return within(screen.getByLabelText('Example pay'))
}

describe('PayRatesPanel', () => {
  beforeEach(() => {
    vi.mocked(userApi.updatePayRates).mockResolvedValue(undefined as never)
  })

  it('shows an 8-hour shift pay for each hourly rate as it is typed, and a dash before', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PayRatesPanel pumpId={2} member={operator} onClose={vi.fn()} />)

    expect(examplePay().getAllByText('—')).toHaveLength(2)

    await user.type(screen.getByLabelText('Night rate'), '60')
    await user.type(screen.getByLabelText('Day rate'), '45.5')

    expect(examplePay().getByText('8-hour night shift').nextSibling).toHaveTextContent('₹480.00')
    expect(examplePay().getByText('8-hour day shift').nextSibling).toHaveTextContent('₹364.00')
  })

  it('shows pay for 26 working days under the daily rate', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PayRatesPanel pumpId={2} member={manager} onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Daily rate'), '800')

    expect(examplePay().getByText('26 working days').nextSibling).toHaveTextContent('₹20,800.00')
  })

  it('keeps Save rates disabled and says which rate is still needed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PayRatesPanel pumpId={2} member={operator} onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Night rate'), '60')

    const save = screen.getByRole('button', { name: 'Save rates' })
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription(/Still needed.*Day rate/)
    expect(save).not.toHaveAccessibleDescription(/Night rate/)

    await user.type(screen.getByLabelText('Day rate'), '45')
    expect(save).toBeEnabled()
    expect(screen.queryByText('Still needed')).not.toBeInTheDocument()

    await user.click(save)
    expect(userApi.updatePayRates).toHaveBeenCalledWith(11, { shift1HourlyRate: 60, standardHourlyRate: 45, dailyRate: undefined })
  })
})
