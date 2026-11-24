import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dipApi } from '../../../api/dipApi'
import type { TankInfo } from '../../../api/pumpApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { NozzleDetail } from '../../../types/shift'
import { localDateInputValue } from '../../../utils/date'
import { RecordDipPanel } from './RecordDipPanel'

vi.mock('../../../api/dipApi', () => ({ dipApi: { recordDip: vi.fn() } }))

const nozzle: NozzleDetail = {
  id: 21, nozzleNumber: 1, fuelType: 'PETROL', lastReading: 1000, maxMeterValue: 99_999_999.999, tankId: 4, status: 'ACTIVE',
}
const tank: TankInfo = {
  id: 4, pumpId: 6, tankIdentifier: 'T1', fuelType: 'PETROL', capacity: 10_000, currentStock: 500,
  dipTolerance: 50, status: 'ACTIVE', createdAt: '2026-01-01T00:00:00Z',
}

async function fillDrain(litres: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Litres removed'), litres)
  await user.type(screen.getByLabelText(/Reason/), 'Filter cleaning')
  await user.click(screen.getByRole('button', { name: 'Record dip' }))
}

describe('RecordDipPanel', () => {
  beforeEach(() => {
    vi.mocked(dipApi.recordDip).mockResolvedValue({} as never)
  })

  it('drains the fuel from the tank the nozzle draws from', async () => {
    renderWithProviders(<RecordDipPanel pumpId={6} nozzle={nozzle} tank={tank} onClose={vi.fn()} />)

    await fillDrain('12.5')

    expect(dipApi.recordDip).toHaveBeenCalledWith(6, 4, 12.5, 'Filter cleaning', localDateInputValue())
  })

  it('locks the drain date to today', () => {
    renderWithProviders(<RecordDipPanel pumpId={6} nozzle={nozzle} tank={tank} onClose={vi.fn()} />)

    const dateInput = screen.getByLabelText(/^Date/)
    expect(dateInput).toHaveValue(localDateInputValue())
    expect(dateInput).toHaveAttribute('readonly')
  })

  it('refuses to drain more than the tank holds', async () => {
    renderWithProviders(<RecordDipPanel pumpId={6} nozzle={nozzle} tank={tank} onClose={vi.fn()} />)

    await fillDrain('600')

    expect(screen.getByRole('alert')).toHaveTextContent('Tank T1 holds only 500 L.')
    expect(dipApi.recordDip).not.toHaveBeenCalled()
  })

  it('cannot record a drain for a nozzle without a mapped tank', () => {
    renderWithProviders(<RecordDipPanel pumpId={6} nozzle={{ ...nozzle, tankId: null }} tank={null} onClose={vi.fn()} />)

    expect(screen.getByText(/not mapped to a tank/)).toBeInTheDocument()
    const record = screen.getByRole('button', { name: 'Record dip' })
    expect(record).toBeDisabled()
    expect(record).toHaveAccessibleDescription(/not mapped to a tank/)
  })

  it('shows what is left in the tank as the litres are typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RecordDipPanel pumpId={6} nozzle={nozzle} tank={tank} onClose={vi.fn()} />)
    const leftInTank = () => screen.getByText('Left in tank', { selector: 'dt' }).nextElementSibling?.textContent

    expect(leftInTank()).toBe('—')

    await user.type(screen.getByLabelText('Litres removed'), '12.5')

    expect(leftInTank()).toBe('487.50 L')
  })
})
