import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calibrationApi } from '../../api/calibrationApi'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import CalibrationPage from './CalibrationPage'

vi.mock('../../api/calibrationApi', () => ({ calibrationApi: { getPumpCalibrations: vi.fn(), getCalibrations: vi.fn() } }))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getDUs: vi.fn() } }))

describe('CalibrationPage', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: 6 })
    vi.mocked(pumpApi.getDUs).mockResolvedValue([
      { id: 1, nozzles: [{ id: 21, nozzleNumber: 1, fuelType: 'PETROL' }, { id: 22, nozzleNumber: 2, fuelType: 'DIESEL' }] },
    ] as never)
    vi.mocked(calibrationApi.getPumpCalibrations).mockResolvedValue({
      content: [], page: 0, pageSize: 10, totalElements: 0, totalPages: 0, hasNext: false, hasPrevious: false,
    })
  })

  it('heads the page with nozzle and record counts, then the form and history sections', async () => {
    renderWithProviders(<CalibrationPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Nozzle Calibration' })).toBeInTheDocument()
    expect(await screen.findByText('2 nozzles')).toBeInTheDocument()
    expect(screen.getByText('0 records')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Record calibration' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Calibration History/ })).toBeInTheDocument()
  })

  it('keeps the history dates in the filter bar and clears them', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CalibrationPage />)

    const filters = screen.getByRole('group', { name: 'Calibration history filters' })
    const from = screen.getByLabelText('From')
    expect(filters).toContainElement(from)

    await user.type(from, '2026-01-01')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(from).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })
})
