import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import type { FuelPrice } from '../../api/pumpApi'
import type { Shift } from '../../types/shift'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import MyShiftPage from './MyShiftPage'

vi.mock('../../api/shiftApi', () => ({ shiftApi: { getActiveShifts: vi.fn() } }))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getCurrentPrices: vi.fn() } }))
vi.mock('./modals/AddCreditEntryModal', () => ({
  AddCreditEntryModal: ({ shift }: { shift: Shift }) => <div role="dialog" aria-label={`Credit sale for shift ${shift.id}`} />,
}))

const openShift = {
  id: 11, pumpId: 4, duId: 2, duNumber: 1, duName: 'DU A', operatorName: 'Raju', status: 'OPEN',
  actualStartTime: new Date(Date.now() - (3 * 60 + 10) * 60_000).toISOString(),
  nozzles: [{ id: 5, nozzleNumber: 1, fuelType: 'PETROL' }, { id: 6, nozzleNumber: 2, fuelType: 'DIESEL' }],
  fuelReadings: [
    { nozzleId: 5, fuelType: 'PETROL', priceSnapshot: 100 },
    { nozzleId: 6, fuelType: 'DIESEL', priceSnapshot: 90 },
  ],
  creditEntries: [
    { id: 1, clientName: 'Fleet Co', amount: 1000, voidStatus: 'ACTIVE' },
    { id: 2, clientName: 'Acme', amount: 250, voidStatus: 'ACTIVE' },
    { id: 3, clientName: 'Acme', amount: 500, voidStatus: 'VOIDED' },
  ],
} as unknown as Shift

const petrolPrice = { fuelType: 'PETROL', pricePerUnit: 102.5 } as FuelPrice

describe('MyShiftPage', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null })
    vi.mocked(pumpApi.getCurrentPrices).mockResolvedValue([petrolPrice])
  })

  it('shows the operator their DU, nozzles, prices, time on shift and credit so far', async () => {
    vi.mocked(shiftApi.getActiveShifts).mockResolvedValue([openShift])
    renderWithProviders(<MyShiftPage />)

    expect(await screen.findByRole('heading', { name: 'DU A' })).toBeInTheDocument()
    expect(screen.getByText('Nozzle #1 Petrol · #2 Diesel')).toBeInTheDocument()
    expect(await screen.findByText('₹102.50/L')).toBeInTheDocument()
    expect(screen.getByText('₹90.00/L')).toBeInTheDocument()
    expect(screen.getByText('3h 10m')).toBeInTheDocument()
    expect(screen.getByText('Credit entries').nextElementSibling).toHaveTextContent('2')
    expect(screen.getByText('₹1,250.00')).toBeInTheDocument()
  })

  it('opens the credit sale form for the shift from the large button', async () => {
    vi.mocked(shiftApi.getActiveShifts).mockResolvedValue([openShift])
    renderWithProviders(<MyShiftPage />)

    await userEvent.setup().click(await screen.findByRole('button', { name: '+ Credit sale' }))

    expect(screen.getByRole('dialog', { name: 'Credit sale for shift 11' })).toBeInTheDocument()
  })

  it('tells the operator to ask the manager when no shift is open', async () => {
    vi.mocked(shiftApi.getActiveShifts).mockResolvedValue([])
    renderWithProviders(<MyShiftPage />)

    expect(await screen.findByText('No open shift.')).toBeInTheDocument()
    expect(screen.getByText('Ask your manager to open your shift.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Credit sale' })).not.toBeInTheDocument()
  })
})
