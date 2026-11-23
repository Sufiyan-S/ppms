import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../../api/shiftApi'
import { useAuthStore } from '../../../store/authStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { useVisibleLayout } from '../../../test/layout'
import type { UserRole } from '../../../types/auth'
import type { Shift } from '../../../types/shift'
import { DiscrepanciesHistory } from './DiscrepanciesHistory'

vi.mock('../../../api/shiftApi', () => ({ shiftApi: { getShiftHistory: vi.fn(), resolveDiscrepancy: vi.fn() } }))

function shortShift(id: number, status: Shift['status']): Shift {
  return {
    id, pumpId: 3, duId: 5, duNumber: 1, duName: 'DU 1',
    nozzles: [{ id: 21, nozzleNumber: 1, fuelType: 'PETROL' }],
    operatorId: 9, operatorName: 'Ravi', openedByUserName: 'Owner', shiftWindow: 'MORNING',
    shiftDate: '2026-03-15', actualStartTime: '2026-03-15T00:30:00Z', actualEndTime: '2026-03-15T08:30:00Z', scheduledEndTime: null,
    fuelReadings: [],
    totalAmountDue: 10000, cashCollected: 8000, upiCollected: 0, cardCollected: 0, fleetCardCollected: 0,
    creditTotal: 0, discrepancyAmount: 2000, discrepancyType: 'SHORT', discrepancyReason: 'Cash bag missing',
    discrepancyResolution: null, discrepancyResolutionNote: null,
    investigationNote: null, investigatedByName: null, investigationStartedAt: null, cashRecoveryAmount: null,
    status, isBackfilled: false, creditEntries: [],
  }
}

const ESCALATED_ID = 11
const PENDING_ID = 12

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: 3 }, isAuthenticated: true })
}

async function rowOf(shiftId: number) {
  const idCell = await screen.findByText(String(shiftId))
  return idCell.closest('tr') as HTMLElement
}

describe('DiscrepanciesHistory', () => {
  useVisibleLayout()

  beforeEach(() => {
    vi.mocked(shiftApi.getShiftHistory).mockResolvedValue([
      shortShift(ESCALATED_ID, 'CLOSED_DISCREPANCY_PENDING_APPROVAL'),
      shortShift(PENDING_ID, 'CLOSED_DISCREPANCY_PENDING'),
    ])
  })

  it('tells a manager an escalated shortage waits for the owner and lets them resolve the ordinary one', async () => {
    signIn('MANAGER')
    renderWithProviders(<DiscrepanciesHistory pumpId={3} />)

    const escalated = await rowOf(ESCALATED_ID)
    expect(within(escalated).getByText('Needs Approval')).toBeInTheDocument()
    expect(within(escalated).getByText('Waiting for owner approval')).toBeInTheDocument()
    expect(within(escalated).queryByRole('button')).not.toBeInTheDocument()

    const pending = await rowOf(PENDING_ID)
    expect(within(pending).getByText('Discrepancy')).toBeInTheDocument()
    expect(within(pending).getByRole('button', { name: `Resolve discrepancy for shift ${PENDING_ID}` })).toBeInTheDocument()
  })

  it('lets the owner approve an escalated shortage from the row, showing who was short and why', async () => {
    const user = userEvent.setup()
    signIn('OWNER')
    renderWithProviders(<DiscrepanciesHistory pumpId={3} />)

    await user.click(within(await rowOf(ESCALATED_ID)).getByRole('button', { name: `Approve discrepancy for shift ${ESCALATED_ID}` }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Shift #11 · Ravi')).toBeInTheDocument()
    expect(within(dialog).getByText('SHORT ₹2,000.00')).toBeInTheDocument()
    expect(within(dialog).getByText('Reason given at close').nextSibling).toHaveTextContent('Cash bag missing')
  })

  it('shows each discrepancy as a card below md with a full-width action, and keeps the table from md up', async () => {
    const user = userEvent.setup()
    signIn('OWNER')
    renderWithProviders(<DiscrepanciesHistory pumpId={3} />)

    const cards = await screen.findAllByTestId('discrepancy-card')
    expect(cards[0].closest('ul')).toHaveClass('md:hidden')
    expect(screen.getByRole('region', { name: 'Discrepancies' })).toHaveClass('hidden', 'md:block')

    const escalated = cards[0]
    expect(within(escalated).getByText('Ravi')).toBeInTheDocument()
    expect(within(escalated).getByText('2026-03-15 · MORNING')).toBeInTheDocument()
    expect(within(escalated).getByText('SHORT ₹2,000.00')).toBeInTheDocument()
    expect(within(escalated).getByText('Needs Approval')).toBeInTheDocument()
    expect(within(escalated).getByText('Cash bag missing')).toBeInTheDocument()
    const approve = within(escalated).getByRole('button', { name: `Approve discrepancy for shift ${ESCALATED_ID}` })
    expect(approve).toHaveClass('ui-btn', 'w-full')

    await user.click(approve)
    expect(await screen.findByRole('dialog')).toHaveTextContent('Shift #11 · Ravi')
  })
})
