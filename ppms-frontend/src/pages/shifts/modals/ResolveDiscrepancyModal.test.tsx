import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../../api/shiftApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { Shift } from '../../../types/shift'
import { ResolveDiscrepancyModal } from './ResolveDiscrepancyModal'

vi.mock('../../../api/shiftApi', () => ({ shiftApi: { resolveDiscrepancy: vi.fn() } }))

const shortShift: Shift = {
  id: 11, pumpId: 3, duId: 5, duNumber: 1, duName: 'DU 1',
  nozzles: [{ id: 21, nozzleNumber: 1, fuelType: 'PETROL' }],
  operatorId: 9, operatorName: 'Ravi', openedByUserName: 'Owner', shiftWindow: 'MORNING',
  shiftDate: '2026-03-15', actualStartTime: '2026-03-15T00:30:00Z', actualEndTime: '2026-03-15T08:30:00Z', scheduledEndTime: null,
  fuelReadings: [],
  totalAmountDue: 1000, cashCollected: 800, upiCollected: 0, cardCollected: 0, fleetCardCollected: 0,
  creditTotal: 0, discrepancyAmount: 200, discrepancyType: 'SHORT', discrepancyReason: 'Short',
  discrepancyResolution: null, discrepancyResolutionNote: null,
  investigationNote: null, investigatedByName: null, investigationStartedAt: null, cashRecoveryAmount: null,
  status: 'CLOSED_DISCREPANCY_PENDING', isBackfilled: false, creditEntries: [],
}

function renderModal(shift: Shift) {
  renderWithProviders(
    <table><tbody><ResolveDiscrepancyModal shift={shift} onClose={vi.fn()} /></tbody></table>,
  )
}

async function chooseAction(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: /^Resolution action/ }))
  await user.click(screen.getByRole('option', { name: label }))
}

describe('ResolveDiscrepancyModal', () => {
  beforeEach(() => {
    vi.mocked(shiftApi.resolveDiscrepancy).mockResolvedValue({} as never)
  })

  it('starts with no action chosen so nothing can be confirmed by accident', () => {
    renderModal(shortShift)

    expect(screen.getByRole('button', { name: 'Resolution action Choose an action…' })).toBeInTheDocument()
    const resolve = screen.getByRole('button', { name: 'Resolve' })
    expect(resolve).toBeDisabled()
    expect(resolve).toHaveAccessibleDescription('Still needed Resolution action')
  })

  it('shows the difference as a badge with the reason given at close', () => {
    renderModal(shortShift)

    expect(screen.getByRole('dialog', { name: 'Resolve discrepancy' })).toHaveTextContent('Shift #11 · Ravi')
    expect(screen.getByText('Short ₹200.00')).toBeInTheDocument()
    expect(screen.getByText('Reason given at close').nextSibling).toHaveTextContent('Short')
  })

  it('needs a note to put the shortage under investigation and then sends it', async () => {
    const user = userEvent.setup()
    renderModal(shortShift)

    await chooseAction(user, 'Pending Investigation')
    await user.click(screen.getByRole('button', { name: 'Start investigation' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Describe what is being investigated')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveAccessibleDescription('Describe what is being investigated.')
    expect(shiftApi.resolveDiscrepancy).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Checking CCTV')
    await user.click(screen.getByRole('button', { name: 'Start investigation' }))
    expect(shiftApi.resolveDiscrepancy).toHaveBeenCalledWith(3, 11,
      { resolutionAction: 'PENDING_INVESTIGATION', resolutionNote: 'Checking CCTV' })
  })

  it('does not offer salary deduction or cash recovery for an excess', async () => {
    const user = userEvent.setup()
    renderModal({ ...shortShift, discrepancyType: 'OVER' })

    await user.click(screen.getByRole('button', { name: /^Resolution action/ }))
    expect(screen.queryByRole('option', { name: 'Salary Deduction' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Cash Recovery' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Waived' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Pending Investigation' })).toBeInTheDocument()
  })

  it('offers salary deduction and cash recovery for a shortage', async () => {
    const user = userEvent.setup()
    renderModal(shortShift)

    await user.click(screen.getByRole('button', { name: /^Resolution action/ }))
    expect(screen.getByRole('option', { name: 'Salary Deduction' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cash Recovery' })).toBeInTheDocument()
  })

  it('shows who is investigating and since when', () => {
    renderModal({
      ...shortShift,
      investigationNote: 'Checking CCTV', investigatedByName: 'Meera', investigationStartedAt: '2026-03-16T05:00:00Z',
    })

    expect(screen.getByText(/Under investigation by Meera since/)).toHaveTextContent('Checking CCTV')
  })
})
