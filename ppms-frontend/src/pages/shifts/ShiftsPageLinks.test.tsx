import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../api/shiftApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import type { Shift } from '../../types/shift'
import ShiftsPage from './ShiftsPage'

vi.mock('../../api/shiftApi', () => ({
  shiftApi: {
    getActiveShifts: vi.fn().mockResolvedValue([]),
    getShift: vi.fn(),
    getShiftHistoryPage: vi.fn(),
    getShiftHistory: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('../../api/pumpApi', () => ({ pumpApi: { getMyPumps: vi.fn().mockResolvedValue([{ id: 4, name: 'Pump' }]) } }))

const closedShift = {
  id: 123, pumpId: 4, duName: 'DU 1', duNumber: 1, nozzles: [{ nozzleId: 3, nozzleNumber: 1, fuelType: 'PETROL' }],
  operatorName: 'Asha', shiftWindow: 'Day', shiftDate: '2026-10-05', actualStartTime: '2026-10-05T03:30:00Z',
  actualEndTime: '2026-10-05T11:30:00Z', totalAmountDue: 1000, cashCollected: 1000, upiCollected: 0, cardCollected: 0,
  fleetCardCollected: 0, creditTotal: 0, discrepancyAmount: null, discrepancyType: null, status: 'CLOSED_BALANCED',
  isBackfilled: false, creditEntries: [],
} as unknown as Shift

function renderAt(path: string) {
  const router = createMemoryRouter([{ path: '/dashboard/shifts', element: <ShiftsPage /> }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('ShiftsPage links from other pages', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 4 })
    vi.mocked(shiftApi.getShiftHistoryPage).mockResolvedValue({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } })
  })

  it('opens the one shift named in the address as its own screen on a phone, with a way back to the list', async () => {
    vi.mocked(shiftApi.getShift).mockResolvedValue(closedShift)
    const router = renderAt('/dashboard/shifts?shift=123')

    expect(await screen.findByRole('heading', { name: 'Shift #123' })).toBeInTheDocument()
    expect(shiftApi.getShift).toHaveBeenCalledWith(4, 123)
    expect(screen.getByRole('link', { name: 'All Shifts' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }))
    expect(router.state.location.search).not.toContain('shift=')
  })

  it('opens all shifts for a fuel and date range', async () => {
    renderAt('/dashboard/shifts?history=all&from=2026-10-01&to=2026-10-31&fuel=PETROL')

    await waitFor(() => expect(shiftApi.getShiftHistoryPage).toHaveBeenCalledWith(
      4, { from: '2026-10-01', to: '2026-10-31', fuelType: 'PETROL' }, 0, 10))
    expect(screen.getByRole('link', { name: 'All Shifts' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: /Showing Petrol shifts only/ })).toBeInTheDocument()
  })

  it('opens the discrepancies tab filtered to short shifts', async () => {
    renderAt('/dashboard/shifts?history=discrepancies&from=2026-10-01&to=2026-10-31&type=SHORT')

    await waitFor(() => expect(shiftApi.getShiftHistory).toHaveBeenCalledWith(4, expect.objectContaining({
      from: '2026-10-01', to: '2026-10-31', discrepanciesOnly: true, discrepancyType: 'SHORT',
    })))
  })
})
