import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fuelPriceApi } from '../../api/fuelPriceApi'
import { pumpApi } from '../../api/pumpApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { userApi } from '../../api/userApi'
import type { StaffMember } from '../../api/userApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { DUOption } from '../../types/shift'
import BackfillShiftModal from './BackfillShiftModal'

vi.mock('../../api/shiftApi', () => ({ shiftApi: { backfillShift: vi.fn() } }))
vi.mock('../../api/shiftDefinitionApi', () => ({ shiftDefinitionApi: { getForDate: vi.fn() } }))
vi.mock('../../api/userApi', () => ({ userApi: { getOperators: vi.fn() } }))
vi.mock('../../api/fuelPriceApi', () => ({ fuelPriceApi: { getForDate: vi.fn() } }))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCreditClients: vi.fn(), getDUs: vi.fn() } }))

const du: DUOption = {
  id: 5, pumpId: 3, duNumber: 1, name: 'DU 1', status: 'ACTIVE',
  nozzles: [{ id: 1, nozzleNumber: 1, fuelType: 'PETROL', lastReading: 0, maxMeterValue: 999_999, tankId: null, status: 'ACTIVE' }],
}

const operator: StaffMember = {
  id: 9, employeeId: 'E9', fullName: 'Ravi', phoneNumber: null, gender: null, nightShiftConsent: false, role: 'OPERATOR',
  assignedPumpId: 3, status: 'ACTIVE', dailyRate: null, shift1HourlyRate: null, standardHourlyRate: null,
}

const summaryValue = (label: string) => screen.getByText(label, { selector: 'dt' }).nextSibling

describe('BackfillShiftModal', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([du])
    vi.mocked(pumpApi.getCreditClients).mockResolvedValue([])
    vi.mocked(userApi.getOperators).mockResolvedValue([operator])
    vi.mocked(shiftDefinitionApi.getForDate).mockResolvedValue([
      { id: 2, name: 'Morning', windowLabel: '06:00–14:00' },
    ] as never)
    vi.mocked(fuelPriceApi.getForDate).mockResolvedValue([{ fuelType: 'PETROL', pricePerUnit: 100 }])
  })

  it('lists what is still needed and works out litres × price, total due and the difference as it is typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BackfillShiftModal pumpId={3} onClose={vi.fn()} />)

    const save = screen.getByRole('button', { name: 'Save past shift' })
    expect(save).toBeDisabled()
    await vi.waitFor(() => expect(save).toHaveAccessibleDescription('Still needed Operator on duty Dispensary unit At least one nozzle'))
    expect(summaryValue('Total due')).toHaveTextContent('—')

    await user.click(await screen.findByRole('button', { name: /Ravi/ }))
    await user.click(screen.getByRole('button', { name: /^Dispensary unit/ }))
    await user.click(await screen.findByRole('option', { name: 'DU 1 (DU #1)' }))
    await user.click(screen.getByRole('button', { name: '#1 · Petrol' }))
    expect(save).toBeEnabled()
    expect(save).not.toHaveAccessibleDescription()

    await user.type(screen.getByLabelText('Nozzle #1 · Petrol opening reading'), '1000')
    await user.type(screen.getByLabelText('Nozzle #1 · Petrol closing reading'), '1010')
    expect(screen.getByText(/10\.000 L × ₹100\.00 =/)).toHaveTextContent('₹1,000.00')
    expect(summaryValue('Total due')).toHaveTextContent('₹1,000.00')
    expect(summaryValue('Difference')).toHaveTextContent('—')

    await user.type(screen.getByLabelText('Cash (₹)'), '990')
    expect(summaryValue('Collected')).toHaveTextContent('₹990.00')
    expect(within(summaryValue('Difference') as HTMLElement).getByText('SHORT ₹10.00')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fill rest · ₹1,000.00' }))
    expect(screen.getByLabelText('Cash (₹)')).toHaveValue(1000)
    expect(summaryValue('Difference')).toHaveTextContent('Balanced')
  })

  it('flags a closing reading below the opening reading next to the nozzle', async () => {
    const user = userEvent.setup()
    renderWithProviders(<BackfillShiftModal pumpId={3} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /^Dispensary unit/ }))
    await user.click(await screen.findByRole('option', { name: 'DU 1 (DU #1)' }))
    await user.click(screen.getByRole('button', { name: '#1 · Petrol' }))
    await user.type(screen.getByLabelText('Nozzle #1 · Petrol opening reading'), '1000')
    await user.type(screen.getByLabelText('Nozzle #1 · Petrol closing reading'), '990')

    expect(screen.getByRole('alert')).toHaveTextContent('Closing reading is below the opening reading.')
  })
})
