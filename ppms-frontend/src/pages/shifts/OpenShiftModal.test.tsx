import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import { shiftApi } from '../../api/shiftApi'
import { shiftDefinitionApi } from '../../api/shiftDefinitionApi'
import { userApi } from '../../api/userApi'
import type { StaffMember } from '../../api/userApi'
import { useToastStore } from '../../store/toastStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { DUOption, NozzleDetail, Shift } from '../../types/shift'
import OpenShiftModal from './OpenShiftModal'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { getDUs: vi.fn() } }))
vi.mock('../../api/shiftApi', () => ({ shiftApi: { openShift: vi.fn() } }))
vi.mock('../../api/shiftDefinitionApi', () => ({ shiftDefinitionApi: { getActive: vi.fn() } }))
vi.mock('../../api/userApi', () => ({ userApi: { getOperators: vi.fn() } }))

function nozzle(id: number, nozzleNumber: number, fuelType: NozzleDetail['fuelType'], lastReading = 1000): NozzleDetail {
  return { id, nozzleNumber, fuelType, lastReading, maxMeterValue: 999_999, tankId: 1, status: 'ACTIVE' }
}

function du(id: number, nozzles: NozzleDetail[]): DUOption {
  return { id, pumpId: 3, duNumber: id, name: `DU ${id}`, status: 'ACTIVE', nozzles }
}

const operator: StaffMember = {
  id: 9, employeeId: 'E9', fullName: 'Ravi', phoneNumber: null, gender: null, nightShiftConsent: false, role: 'OPERATOR',
  assignedPumpId: 3, status: 'ACTIVE', dailyRate: null, shift1HourlyRate: null, standardHourlyRate: null,
}

const busyShift = { id: 70, operatorId: 50, nozzles: [{ id: 23, nozzleNumber: 3, fuelType: 'DIESEL' }] } as unknown as Shift
const busyShiftWithName = { ...busyShift, operatorName: 'Sita' } as Shift

function nozzleGroup() {
  return screen.getByRole('group', { name: 'Select nozzles' })
}

function nozzleTile(number: number) {
  return within(nozzleGroup()).getByRole('button', { name: new RegExp(`#${number}`) })
}

function section(name: string) {
  return screen.getByRole('region', { name: new RegExp(`^${name}`) })
}

describe('OpenShiftModal', () => {
  beforeEach(() => {
    vi.mocked(userApi.getOperators).mockResolvedValue([operator])
    vi.mocked(shiftDefinitionApi.getActive).mockResolvedValue([])
    vi.mocked(shiftApi.openShift).mockResolvedValue({ operatorName: 'Ravi' } as Shift)
    useToastStore.setState({ toasts: [] })
  })

  it('picks the only dispensary unit and its free nozzles, then says what is still missing', async () => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([
      du(1, [nozzle(21, 1, 'PETROL'), nozzle(22, 2, 'DIESEL'), nozzle(23, 3, 'DIESEL')]),
    ])
    const user = userEvent.setup()
    renderWithProviders(<OpenShiftModal pumpId={3} activeShifts={[busyShift]} onClose={vi.fn()} />)

    expect(await screen.findByText('2 of 4 done')).toBeInTheDocument()
    expect(section('Nozzles')).toHaveTextContent('#1 Petrol · 1,000 L#2 Diesel · 1,000 L')
    expect(screen.getByText('2 nozzles will start from the meter readings shown on their cards in step 2.')).toBeInTheDocument()
    const openButton = screen.getByRole('button', { name: 'Open shift' })
    expect(openButton).toBeDisabled()
    expect(openButton).toHaveAccessibleDescription('Still needed Pick an operator Confirm the meter readings')

    await user.click(await screen.findByRole('button', { name: /Ravi/ }))
    expect(openButton).toHaveAccessibleDescription('Still needed Confirm the meter readings')
    const readingsCheckbox = screen.getByLabelText(/I confirm the meter readings above are correct/)
    expect(readingsCheckbox).toHaveFocus()

    await user.click(readingsCheckbox)
    expect(screen.getByText('4 of 4 done')).toBeInTheDocument()
    expect(openButton).toBeEnabled()
    expect(openButton).not.toHaveAccessibleDescription()
    await user.click(openButton)

    expect(shiftApi.openShift).toHaveBeenCalledWith(3, { duId: 1, nozzleIds: [21, 22], operatorId: 9 })
    await waitFor(() => expect(useToastStore.getState().toasts).toEqual([
      expect.objectContaining({ message: 'Shift opened for Ravi', variant: 'success' }),
    ]))
  })

  it('leaves the choice to the user when the pump has several dispensary units', async () => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([du(1, [nozzle(21, 1, 'PETROL')]), du(2, [nozzle(31, 1, 'DIESEL')])])
    const user = userEvent.setup()
    renderWithProviders(<OpenShiftModal pumpId={3} activeShifts={[]} onClose={vi.fn()} />)

    const secondDu = await screen.findByRole('button', { name: /DU 2/ })
    const openButton = screen.getByRole('button', { name: 'Open shift' })
    expect(openButton).toBeDisabled()
    expect(openButton).toHaveAccessibleDescription(/^Still needed Pick a dispensary unit/)
    expect(screen.queryByRole('group', { name: 'Select nozzles' })).not.toBeInTheDocument()
    expect(section('Nozzles')).toHaveTextContent('Pick a dispensary unit first')

    await user.click(secondDu)
    expect(section('Dispensary unit')).toHaveTextContent('DU #2 · DU 2')
    expect(nozzleTile(1)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Select all free nozzles' })).toHaveFocus()
    expect(openButton).toHaveAccessibleDescription(/^Still needed Select at least one nozzle/)
  })

  it('shows each dispensary unit with its fuels and how many nozzles are free', async () => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([
      du(1, [nozzle(21, 1, 'PETROL'), nozzle(22, 2, 'DIESEL'), nozzle(23, 3, 'DIESEL')]),
      du(2, [nozzle(31, 1, 'CNG')]),
    ])
    const busyCng = { id: 71, operatorId: 51, operatorName: 'Asha', nozzles: [{ id: 31, nozzleNumber: 1, fuelType: 'CNG' }] } as unknown as Shift
    renderWithProviders(<OpenShiftModal pumpId={3} activeShifts={[busyShift, busyCng]} onClose={vi.fn()} />)

    const firstDu = await screen.findByRole('button', { name: /DU 1/ })
    expect(within(firstDu).getByText('Petrol')).toBeInTheDocument()
    expect(within(firstDu).getByText('Diesel')).toBeInTheDocument()
    expect(firstDu).toHaveTextContent('2 free · 1 in use')
    expect(firstDu).toBeEnabled()

    const secondDu = screen.getByRole('button', { name: /DU 2/ })
    expect(within(secondDu).getByText('CNG')).toBeInTheDocument()
    expect(secondDu).toHaveTextContent('All nozzles in use')
    expect(secondDu).toBeDisabled()
  })

  it('shows the meter reading on each nozzle card and who has a busy nozzle', async () => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([
      du(1, [nozzle(21, 1, 'PETROL', 123456.789), nozzle(22, 2, 'CNG', 50.5), nozzle(23, 3, 'DIESEL')]),
    ])
    const user = userEvent.setup()
    renderWithProviders(<OpenShiftModal pumpId={3} activeShifts={[busyShiftWithName]} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: 'Change Nozzles' }))

    expect(nozzleTile(1)).toHaveTextContent('Meter 1,23,456.789 L')
    expect(nozzleTile(2)).toHaveTextContent('Meter 50.5 kg')
    expect(nozzleTile(3)).toHaveTextContent('In use · Sita')
    expect(nozzleTile(3)).toBeDisabled()
    expect(nozzleTile(3)).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects every free nozzle at once and clears them again', async () => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([
      du(1, [nozzle(21, 1, 'PETROL'), nozzle(22, 2, 'DIESEL'), nozzle(23, 3, 'DIESEL')]),
      du(2, [nozzle(31, 1, 'DIESEL')]),
    ])
    const user = userEvent.setup()
    renderWithProviders(<OpenShiftModal pumpId={3} activeShifts={[busyShift]} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /DU 1/ }))
    const continueButton = screen.getByRole('button', { name: 'Continue' })
    expect(continueButton).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Select all free nozzles' }))
    expect(nozzleTile(1)).toHaveAttribute('aria-pressed', 'true')
    expect(nozzleTile(2)).toHaveAttribute('aria-pressed', 'true')
    expect(nozzleTile(3)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select all free nozzles' })).toBeDisabled()
    expect(continueButton).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(nozzleTile(1)).toHaveAttribute('aria-pressed', 'false')
    expect(nozzleTile(2)).toHaveAttribute('aria-pressed', 'false')
    expect(continueButton).toBeDisabled()
  })

  it('collapses a finished step to a summary that can be opened again', async () => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([du(1, [nozzle(21, 1, 'PETROL')]), du(2, [nozzle(31, 1, 'DIESEL')])])
    const user = userEvent.setup()
    renderWithProviders(<OpenShiftModal pumpId={3} activeShifts={[]} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /DU 1/ }))
    await user.click(nozzleTile(1))
    expect(nozzleTile(1)).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.queryByRole('group', { name: 'Select nozzles' })).not.toBeInTheDocument()
    expect(section('Nozzles')).toHaveTextContent('#1 Petrol · 1,000 L')
    expect(screen.getByRole('button', { name: /Ravi/ })).toBeInTheDocument()

    const changeDu = screen.getByRole('button', { name: 'Change Dispensary unit' })
    expect(changeDu).toHaveAttribute('aria-expanded', 'false')
    await user.click(changeDu)

    const firstDu = screen.getByRole('button', { name: /DU 1/ })
    expect(firstDu).toHaveAttribute('aria-pressed', 'true')
    expect(firstDu).toHaveFocus()
    expect(screen.queryByRole('button', { name: /Ravi/ })).not.toBeInTheDocument()

    await user.click(firstDu)
    expect(section('Nozzles')).toHaveTextContent('#1 Petrol · 1,000 L')
    expect(screen.getByText('2 of 4 done')).toBeInTheDocument()
  })

  it('clears the nozzles and the readings confirmation when another dispensary unit is picked', async () => {
    vi.mocked(pumpApi.getDUs).mockResolvedValue([du(1, [nozzle(21, 1, 'PETROL')]), du(2, [nozzle(31, 1, 'DIESEL')])])
    const user = userEvent.setup()
    renderWithProviders(
      <OpenShiftModal pumpId={3} activeShifts={[]} onClose={vi.fn()} prefilledDuId={1} prefilledNozzleIds={[21]} />,
    )

    await user.click(await screen.findByRole('button', { name: /Ravi/ }))
    await user.click(screen.getByLabelText(/I confirm the meter readings above are correct/))
    expect(screen.getByText('4 of 4 done')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change Dispensary unit' }))
    await user.click(screen.getByRole('button', { name: /DU 2/ }))

    expect(nozzleTile(1)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByLabelText(/I confirm the meter readings above are correct/)).not.toBeInTheDocument()
    expect(screen.getByText('Select nozzles to see the readings they start from.')).toBeInTheDocument()
    expect(screen.getByText('2 of 4 done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open shift' }))
      .toHaveAccessibleDescription('Still needed Select at least one nozzle Confirm the meter readings')
  })
})
