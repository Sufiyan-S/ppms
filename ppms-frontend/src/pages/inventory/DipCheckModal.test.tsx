import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '../../api/inventoryApi'
import type { OpenShiftNozzle, TankStock } from '../../api/inventoryApi'
import { userApi } from '../../api/userApi'
import { useToastStore } from '../../store/toastStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import { DipCheckModal } from './DipCheckModal'

vi.mock('../../api/inventoryApi', () => ({
  inventoryApi: { getOpenShiftNozzles: vi.fn(), recordDipCheck: vi.fn() },
}))
vi.mock('../../api/userApi', () => ({ userApi: { getStaff: vi.fn() } }))

const tank: TankStock = {
  tankId: 1, tankIdentifier: 'T1', fuelType: 'PETROL', capacity: 10_000, currentStock: 1_000,
  stockPercentage: 10, lowStock: true, dipTolerance: 50, pumpId: 6,
}

const openNozzle: OpenShiftNozzle = {
  shiftId: 9, nozzleId: 21, nozzleNumber: 1, duName: 'DU-1', fuelType: 'PETROL',
  openingReading: 1000, maxMeterValue: 99_999_999.999,
}

function figure(label: string) {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement
}

describe('DipCheckModal', () => {
  beforeEach(() => {
    vi.mocked(userApi.getStaff).mockResolvedValue([])
    vi.mocked(inventoryApi.recordDipCheck).mockResolvedValue({} as never)
    useToastStore.setState({ toasts: [] })
  })

  it('asks for the meter reading of each nozzle on an open shift and takes its sales off the expected stock', async () => {
    vi.mocked(inventoryApi.getOpenShiftNozzles).mockResolvedValue([openNozzle])
    const user = userEvent.setup()
    renderWithProviders(<DipCheckModal pumpId={6} tank={tank} onClose={vi.fn()} />)

    const reading = await screen.findByLabelText('Nozzle #1 · DU-1 meter reading')
    expect(reading).toHaveAccessibleDescription('Opened at 1,000.000')
    await user.type(reading, '1030')
    await user.type(screen.getByLabelText('Dipstick reading'), '965')

    await user.click(screen.getByRole('button', { name: 'Save dip check' }))
    expect(inventoryApi.recordDipCheck).toHaveBeenCalledWith(6, {
      tankId: 1, measuredQuantity: 965, checkedByUserId: undefined, notes: undefined,
      nozzleReadings: [{ nozzleId: 21, meterReading: 1030 }],
    })
    await waitFor(() => expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ message: 'Dip check saved for T1', variant: 'success' }),
    ]))
  })

  it('works out the expected stock and the variance as readings are typed', async () => {
    vi.mocked(inventoryApi.getOpenShiftNozzles).mockResolvedValue([openNozzle])
    const user = userEvent.setup()
    renderWithProviders(<DipCheckModal pumpId={6} tank={tank} onClose={vi.fn()} />)

    const reading = await screen.findByLabelText('Nozzle #1 · DU-1 meter reading')
    expect(figure('Book stock now')).toHaveTextContent('1,000.0 L')
    expect(figure('Expected in tank')).toHaveTextContent('—')
    expect(figure('Variance')).toHaveTextContent('—')

    await user.type(reading, '1030')
    await user.type(screen.getByLabelText('Dipstick reading'), '965')

    expect(figure('Sold on open shifts')).toHaveTextContent('30.0 L')
    expect(figure('Expected in tank')).toHaveTextContent('970.0 L')
    expect(figure('Measured by dip')).toHaveTextContent('965.0 L')
    expect(figure('Variance')).toHaveTextContent('−5.0 L')
    expect(figure('Variance')).toHaveTextContent('Within tolerance')
  })

  it('flags a shortage beyond the tank tolerance', async () => {
    vi.mocked(inventoryApi.getOpenShiftNozzles).mockResolvedValue([])
    const user = userEvent.setup()
    renderWithProviders(<DipCheckModal pumpId={6} tank={tank} onClose={vi.fn()} />)

    await user.type(await screen.findByLabelText('Dipstick reading'), '900')

    expect(figure('Variance')).toHaveTextContent('−100.0 L')
    expect(figure('Variance')).toHaveTextContent('Shortage detected')
  })

  it('keeps Save unavailable and says what is still needed until the dip and meter readings are in', async () => {
    vi.mocked(inventoryApi.getOpenShiftNozzles).mockResolvedValue([openNozzle])
    const user = userEvent.setup()
    renderWithProviders(<DipCheckModal pumpId={6} tank={tank} onClose={vi.fn()} />)

    await screen.findByLabelText('Nozzle #1 · DU-1 meter reading')
    const save = screen.getByRole('button', { name: 'Save dip check' })
    expect(save).toBeDisabled()
    expect(save).toHaveAccessibleDescription(/Still needed\s*Dipstick reading\s*Meter reading for 1 nozzle/)

    await user.type(screen.getByLabelText('Dipstick reading'), '965')
    expect(save).toHaveAccessibleDescription(/Meter reading for 1 nozzle/)

    await user.type(screen.getByLabelText('Nozzle #1 · DU-1 meter reading'), '1030')
    expect(save).toBeEnabled()
    expect(save).not.toHaveAccessibleDescription()
  })

  it('has no date to choose, because a dip check is always for today', async () => {
    vi.mocked(inventoryApi.getOpenShiftNozzles).mockResolvedValue([])
    renderWithProviders(<DipCheckModal pumpId={6} tank={tank} onClose={vi.fn()} />)

    expect(await screen.findByText(/Recorded for today/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Check date')).not.toBeInTheDocument()
    expect(screen.queryByText('Current meter readings')).not.toBeInTheDocument()
  })
})
