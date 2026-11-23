import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dipApi } from '../../../api/dipApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { NozzleDetail } from '../../../types/shift'
import { AdjustReadingPanel } from './AdjustReadingPanel'

vi.mock('../../../api/dipApi', () => ({ dipApi: { recordAdjustment: vi.fn() } }))

const nozzle: NozzleDetail = {
  id: 21, nozzleNumber: 2, fuelType: 'PETROL', lastReading: 1000, maxMeterValue: 99_999_999.999, tankId: 4, status: 'ACTIVE',
}

const figure = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent

describe('AdjustReadingPanel', () => {
  beforeEach(() => {
    vi.mocked(dipApi.recordAdjustment).mockResolvedValue({} as never)
  })

  it('shows the difference from the current reading as the new reading is typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdjustReadingPanel pumpId={6} nozzle={nozzle} onClose={vi.fn()} />)

    expect(figure('Current reading')).toBe('1,000 L')
    expect(figure('Difference')).toBe('—')

    await user.type(screen.getByRole('spinbutton', { name: 'New reading' }), '1012.5')

    expect(figure('Difference')).toBe('+12.5 L')
  })

  it('shows the whole reading going when the meter is reset to zero', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdjustReadingPanel pumpId={6} nozzle={nozzle} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Reset to zero/ }))

    expect(figure('Difference')).toBe('−1,000 L')
    expect(screen.getByRole('button', { name: 'Reset to zero' })).toHaveClass('ui-btn-danger')
  })
})
