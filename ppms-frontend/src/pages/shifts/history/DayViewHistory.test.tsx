import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../../api/shiftApi'
import { useAuthStore } from '../../../store/authStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { useVisibleLayout } from '../../../test/layout'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../../test/screenWidth'
import type { Shift } from '../../../types/shift'
import { localDateInputValue } from '../../../utils/date'
import { DayViewHistory } from './DayViewHistory'

vi.mock('../../../api/shiftApi', () => ({ shiftApi: { getShiftHistory: vi.fn() } }))

function todaysShift(overrides: Partial<Shift>): Shift {
  return {
    id: 46, pumpId: 3, duId: 5, duNumber: 1, duName: 'A',
    nozzles: [{ id: 21, nozzleNumber: 2, fuelType: 'DIESEL' }],
    operatorId: 9, operatorName: 'Asha', openedByUserName: 'Owner', shiftWindow: 'Morning',
    shiftDate: localDateInputValue(), actualStartTime: '2026-11-24T00:30:00Z', actualEndTime: '2026-11-24T08:30:00Z', scheduledEndTime: null,
    fuelReadings: [],
    totalAmountDue: 43000, cashCollected: 30000, upiCollected: 5000, cardCollected: 2000, fleetCardCollected: 0,
    creditTotal: 4000, discrepancyAmount: 2000, discrepancyType: 'SHORT', discrepancyReason: null,
    discrepancyResolution: null, discrepancyResolutionNote: null,
    investigationNote: null, investigatedByName: null, investigationStartedAt: null, cashRecoveryAmount: null,
    status: 'CLOSED_DISCREPANCY_PENDING', isBackfilled: false,
    creditEntries: [
      { id: 1, clientId: 7, clientName: 'Sharma Transport', billNo: null, amount: 2500, fuelType: 'DIESEL', description: null, voidStatus: 'ACTIVE', voidReason: null },
      { id: 2, clientId: 8, clientName: 'Patil Farms', billNo: null, amount: 1500, fuelType: 'DIESEL', description: null, voidStatus: 'ACTIVE', voidReason: null },
    ],
    ...overrides,
  } as Shift
}

describe('DayViewHistory', () => {
  useVisibleLayout()
  resetScreenWidthAfterEach()

  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: 3 }, isAuthenticated: true })
    vi.mocked(shiftApi.getShiftHistory).mockResolvedValue([
      todaysShift({}),
      todaysShift({ id: 47, totalAmountDue: null, status: 'OPEN', actualEndTime: null, discrepancyAmount: null, discrepancyType: null, creditEntries: [] }),
    ])
  })

  it('keeps the day total in its own right-hand group so a wrapping day label never pushes it out of view', async () => {
    const user = userEvent.setup()
    renderWithProviders(<DayViewHistory pumpId={3} />)

    const header = await screen.findByRole('button', { name: /Today/ })
    expect(header).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById(header.getAttribute('aria-controls') ?? '')
    expect(panel).not.toBeNull()

    const label = within(header).getAllByText('Today')[0]
    expect(label.parentElement).toHaveClass('flex-wrap', 'min-w-0')
    expect(within(label.parentElement as HTMLElement).getByText('2 shifts (1 still open)')).toBeInTheDocument()

    const total = within(header).getByText('₹43,000.00')
    expect(total).toHaveClass('tabular-nums')
    expect(total.parentElement).toHaveClass('ml-auto', 'shrink-0')
    expect(label.parentElement).not.toContainElement(total)

    await user.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toBeVisible()
  })

  describe('on a wide screen', () => {
    beforeEach(() => setScreenWidth(1280))

    it('shows the DU and nozzle on one line and the amount due right-aligned', async () => {
      renderWithProviders(<DayViewHistory pumpId={3} />)

      const table = await screen.findByRole('table', { name: 'Shifts for Today' })
      const duName = within(table).getAllByText('DU A')[0]
      expect(duName.parentElement).toHaveTextContent('DU A · #2 Diesel')
      expect(duName.parentElement).toHaveClass('whitespace-nowrap')
      expect(duName).not.toHaveClass('block')

      expect(within(table).getByRole('columnheader', { name: 'Amount Due' })).toHaveClass('text-right', 'tabular-nums')
      expect(within(table).getAllByText('₹43,000.00')[0].closest('td')).toHaveClass('text-right', 'tabular-nums')
    })

    it('keeps the payment strip within the visible width while the table scrolls, as right-aligned label and amount pairs', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DayViewHistory pumpId={3} />)

      const strip = await screen.findByTestId('payment-breakdown')
      expect(strip).toHaveClass('flex-wrap', 'justify-end')
      expect(strip.parentElement).toHaveClass('sticky', 'left-0', 'max-w-[100cqw]')
      expect(screen.getByRole('region', { name: 'Shifts for the day' })).toHaveClass('@container')

      const pairs = within(strip).getAllByRole('term').map((term) => term.textContent)
      expect(pairs).toEqual(['Cash', 'UPI + Card', 'Credit'])
      expect(within(strip).getByText('₹30,000.00').closest('dd')).toHaveClass('text-right')
      expect(within(strip).getByText('₹7,000.00').closest('dd')).toHaveTextContent('UPI ₹5,000.00Card ₹2,000.00₹7,000.00')

      await user.click(within(strip).getByRole('button', { name: /2 clients/ }))
      expect(await screen.findByRole('dialog')).toHaveTextContent('Sharma Transport')
    })
  })

  describe('on a phone', () => {
    beforeEach(() => setScreenWidth(375))

    it('shows each shift as a card with its nozzle, status, operator, amount, payments and actions', async () => {
      const user = userEvent.setup()
      renderWithProviders(<DayViewHistory pumpId={3} />)

      const cards = await screen.findAllByTestId('history-card')
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(cards[0].closest('ul')).toHaveAccessibleName('Shifts for Today')

      const closed = cards[0]
      expect(within(closed).getByText(/#46/).closest('p')).toHaveTextContent('#46 · DU A · #2 Diesel')
      expect(within(closed).getByText('Discrepancy')).toBeInTheDocument()
      expect(within(closed).getByText(/Asha/).closest('p')).toHaveTextContent(/^Asha · Morning · .+–.+$/)
      expect(within(closed).getByText('SHORT ₹2,000.00')).toBeInTheDocument()
      expect(within(closed).getByText('₹43,000.00').parentElement).toHaveClass('ml-auto', 'justify-end')

      const payments = within(closed).getByTestId('payment-breakdown')
      expect(within(payments).getAllByRole('term').map((term) => term.textContent)).toEqual(['Cash', 'UPI + Card', 'Credit'])
      expect(within(payments).queryByRole('button')).not.toBeInTheDocument()
      expect(within(payments).getByText('₹4,000.00').closest('dd')).toHaveTextContent('2 clients₹4,000.00')

      const resolve = within(closed).getByRole('button', { name: 'Resolve' })
      const credit = within(closed).getByRole('button', { name: 'Credit sales · 2 clients' })
      const handover = within(closed).getByRole('button', { name: 'Print handover report' })
      for (const action of [resolve, credit, handover]) expect(action).toHaveClass('ui-btn', 'w-full')

      await user.click(credit)
      expect(await screen.findByRole('dialog')).toHaveTextContent('Patil Farms')

      const open = cards[1]
      expect(within(open).getByText(/Asha/).closest('p')).toHaveTextContent(/–Open$/)
      expect(within(open).queryByTestId('payment-breakdown')).not.toBeInTheDocument()
      expect(within(open).queryByRole('button')).not.toBeInTheDocument()
    })
  })
})
