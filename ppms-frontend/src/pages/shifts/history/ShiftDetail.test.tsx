import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../../api/shiftApi'
import { useAuthStore } from '../../../store/authStore'
import { useVisibleLayout } from '../../../test/layout'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { Shift } from '../../../types/shift'
import { ShiftDetail } from './ShiftDetail'

vi.mock('../../../api/shiftApi', () => ({ shiftApi: { getShift: vi.fn() } }))
vi.mock('../modals/ResolveDiscrepancyModal', () => ({ ResolveDiscrepancyModal: () => <div role="dialog" aria-label="Resolve form" /> }))

const shortShift = {
  id: 77, pumpId: 4, duName: 'DU 2', duNumber: 2, nozzles: [{ nozzleId: 3, nozzleNumber: 1, fuelType: 'PETROL' }],
  operatorName: 'Asha', shiftWindow: 'Day', shiftDate: '2026-11-20', actualStartTime: '2026-11-20T03:30:00Z',
  actualEndTime: '2026-11-20T11:30:00Z', fuelReadings: [], totalAmountDue: 10_000, cashCollected: 9_500, upiCollected: 0,
  cardCollected: 0, fleetCardCollected: 0, creditTotal: 0, discrepancyAmount: 500, discrepancyType: 'SHORT',
  discrepancyReason: 'Change given twice', discrepancyResolution: null, investigationNote: null,
  status: 'CLOSED_DISCREPANCY_PENDING', isBackfilled: false,
  creditEntries: [{ id: 1, clientName: 'Acme Transport', billNo: 'B-12', amount: 0 }],
} as unknown as Shift

describe('ShiftDetail', () => {
  useVisibleLayout()

  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Mgr', role: 'MANAGER', assignedPumpId: 4 }, isAuthenticated: true })
    vi.mocked(shiftApi.getShift).mockResolvedValue(shortShift)
  })

  it('shows who worked the shift, what was collected, the discrepancy and the credit sales', async () => {
    renderWithProviders(<ShiftDetail pumpId={4} shiftId={77} />)

    const detail = await screen.findByRole('article', { name: 'Shift #77' })
    expect(within(detail).getByText('Asha')).toBeInTheDocument()
    expect(within(detail).getByText('#1 Petrol')).toBeInTheDocument()
    expect(within(detail).getByRole('region', { name: 'Collections' })).toHaveTextContent('₹9,500.00')
    expect(within(detail).getByRole('region', { name: 'Discrepancy' })).toHaveTextContent('Change given twice')
    expect(within(detail).getByRole('region', { name: 'Credit sales' })).toHaveTextContent('Acme Transport')
    expect(shiftApi.getShift).toHaveBeenCalledWith(4, 77)
  })

  it('lets a manager resolve the discrepancy and opens the handover report in a side panel', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ShiftDetail pumpId={4} shiftId={77} />)

    await user.click(await screen.findByRole('button', { name: 'Resolve' }))
    expect(screen.getByRole('dialog', { name: 'Resolve form' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Print handover report' }))
    const report = screen.getByRole('dialog', { name: 'Shift handover report' })
    expect(report.querySelector('.ui-side-panel')).not.toBeNull()
  })

  it('says so when the shift cannot be found at this pump', async () => {
    vi.mocked(shiftApi.getShift).mockRejectedValue(new Error('not found'))
    renderWithProviders(<ShiftDetail pumpId={4} shiftId={999} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Shift #999 could not be found at this pump.')
  })
})
