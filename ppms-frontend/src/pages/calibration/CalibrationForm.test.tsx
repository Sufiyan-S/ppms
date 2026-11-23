import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calibrationApi } from '../../api/calibrationApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { NozzleDetail } from '../../types/shift'
import { addDays, localDateInputValue } from '../../utils/date'
import { CalibrationForm } from './CalibrationForm'

vi.mock('../../api/calibrationApi', () => ({ calibrationApi: { recordCalibration: vi.fn() } }))

const nozzle: NozzleDetail = {
  id: 21, nozzleNumber: 1, fuelType: 'PETROL', lastReading: 1000, maxMeterValue: 99_999_999.999, tankId: 4, status: 'ACTIVE',
}

async function chooseNozzleAndTechnician() {
  const user = userEvent.setup()
  renderWithProviders(<CalibrationForm pumpId={6} nozzles={[nozzle]} onRecorded={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /Nozzle:/ }))
  await user.click(await screen.findByRole('option', { name: /Nozzle #1/ }))
  await user.type(screen.getByLabelText('Calibrated by'), 'Weights Dept')
  return user
}

describe('CalibrationForm', () => {
  beforeEach(() => {
    vi.mocked(calibrationApi.recordCalibration).mockResolvedValue({} as never)
  })

  it('refuses a calibration without a next due date and says so under that field', async () => {
    const user = await chooseNozzleAndTechnician()
    await user.type(screen.getByLabelText('Certificate reference'), 'CERT-1')

    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByLabelText('Next calibration due')).toHaveAccessibleDescription('Next calibration due date is required')
    expect(calibrationApi.recordCalibration).not.toHaveBeenCalled()
  })

  it('refuses a calibration without a certificate reference and says so under that field', async () => {
    const user = await chooseNozzleAndTechnician()
    await user.type(screen.getByLabelText('Next calibration due'), addDays(localDateInputValue(), 180))

    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(screen.getByLabelText('Certificate reference')).toHaveAccessibleDescription('Certificate reference is required')
  })

  it('only offers next due dates after the calibration date', () => {
    renderWithProviders(<CalibrationForm pumpId={6} nozzles={[nozzle]} onRecorded={vi.fn()} />)

    expect(screen.getByLabelText('Next calibration due')).toHaveAttribute('min', addDays(localDateInputValue(), 1))
  })

  it('reviews the details with the nozzle in the header before saving', async () => {
    const user = await chooseNozzleAndTechnician()
    await user.type(screen.getByLabelText('Next calibration due'), addDays(localDateInputValue(), 180))
    await user.type(screen.getByLabelText('Certificate reference'), 'CERT-1')

    await user.click(screen.getByRole('button', { name: 'Review' }))

    const dialog = screen.getByRole('dialog', { name: 'Review calibration' })
    expect(dialog).toHaveTextContent('Nozzle #1 — Petrol')
    await user.click(screen.getByRole('button', { name: 'Confirm calibration' }))
    expect(calibrationApi.recordCalibration).toHaveBeenCalledWith(6, 21, expect.objectContaining({
      calibratedBy: 'Weights Dept', certificateReference: 'CERT-1',
    }))
  })
})
