import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../../api/shiftApi'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { useAuthStore } from '../../../store/authStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { UserRole } from '../../../types/auth'
import type { Shift } from '../../../types/shift'
import { TopBarShiftChip } from './TopBarShiftChip'

vi.mock('../../../api/shiftDefinitionApi', () => ({ shiftDefinitionApi: { getActive: vi.fn() } }))
vi.mock('../../../api/shiftApi', () => ({ shiftApi: { getActiveShifts: vi.fn() } }))

function definition(overrides: Partial<ShiftDefinition>): ShiftDefinition {
  return {
    id: 1, pumpId: 4, name: 'Morning', startTime: '06:00:00', endTime: '13:59:00', crossesMidnight: false,
    isNightShift: false, sortOrder: 1, effectiveFrom: '2026-01-01', effectiveTo: null, windowLabel: '6:00 AM – 2:00 PM',
    ...overrides,
  }
}

const night = definition({ id: 2, name: 'Night', startTime: '22:00:00', endTime: '05:59:00', crossesMidnight: true, isNightShift: true })

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: 4 }, isAuthenticated: true })
}

describe('TopBarShiftChip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-23T06:16:00Z')) // 11:46 IST, 2h 14m before the morning shift ends
    vi.mocked(shiftDefinitionApi.getActive).mockResolvedValue([definition({}), night])
    vi.mocked(shiftApi.getActiveShifts).mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }] as Shift[])
  })
  afterEach(() => vi.useRealTimers())

  it('shows managers the current window, time left and open shifts, as one link to Shifts', async () => {
    signIn('MANAGER')
    const { container } = renderWithProviders(<TopBarShiftChip pumpId={4} />)

    const link = await screen.findByRole('link', {
      name: 'Current shift: Morning, ends in 2h 14m. View shifts. 3 shifts open.',
    })
    expect(link).toHaveAttribute('href', '/dashboard/shifts')
    expect(link).toHaveTextContent('Morning shift · ends in 2h 14m')
    expect(link).toHaveTextContent('3 open')
    expect(container.querySelector('.ui-topbar-shift__ring')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.ui-topbar-shift__live')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.ui-topbar-shift__dot--live')).toBeInTheDocument()
    expect(container.querySelector('.ui-topbar-shift__ring-fill')).toHaveAttribute('stroke-dashoffset', '27.9')
    expect(shiftDefinitionApi.getActive).toHaveBeenCalledWith(4)
  })

  it('counts down every minute', async () => {
    signIn('OWNER')
    renderWithProviders(<TopBarShiftChip pumpId={4} />)
    expect(await screen.findByRole('link', { name: /ends in 2h 14m/ })).toHaveTextContent('ends in 2h 14m')

    await act(async () => { vi.advanceTimersByTime(60_000) })

    expect(screen.getByRole('link', { name: /ends in 2h 13m/ })).toHaveTextContent('ends in 2h 13m')
  })

  it('shows the night window with its own label after midnight', async () => {
    signIn('ADMIN')
    vi.setSystemTime(new Date('2026-11-23T20:30:00Z')) // 02:00 IST
    renderWithProviders(<TopBarShiftChip pumpId={4} />)

    expect(await screen.findByRole('link', { name: /Current shift: Night, ends in 4h\./ })).toBeInTheDocument()
  })

  it('shows an operator the window without a pump-wide open count', async () => {
    signIn('OPERATOR')
    renderWithProviders(<TopBarShiftChip pumpId={4} />)

    const link = await screen.findByRole('link', { name: 'Current shift: Morning, ends in 2h 14m. View shifts.' })
    expect(link).not.toHaveTextContent('open')
    expect(shiftApi.getActiveShifts).not.toHaveBeenCalled()
  })

  it('is hidden from accountants without asking the server', () => {
    signIn('ACCOUNTANT')
    const { container } = renderWithProviders(<TopBarShiftChip pumpId={4} />)

    expect(container).toBeEmptyDOMElement()
    expect(shiftDefinitionApi.getActive).not.toHaveBeenCalled()
  })

  it('is hidden between windows and when the pump has no shift definitions', async () => {
    signIn('OWNER')
    vi.mocked(shiftDefinitionApi.getActive).mockResolvedValueOnce([definition({ startTime: '06:00:00', endTime: '09:59:00' })])
    const { container, unmount } = renderWithProviders(<TopBarShiftChip pumpId={4} />)
    await vi.waitFor(() => expect(shiftDefinitionApi.getActive).toHaveBeenCalled())
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
    unmount()

    vi.mocked(shiftDefinitionApi.getActive).mockResolvedValueOnce([])
    const second = renderWithProviders(<TopBarShiftChip pumpId={4} />)
    await act(async () => {})
    expect(second.container).toBeEmptyDOMElement()
  })

  it('reads the open count from the list the Shifts page already loaded, without asking again', async () => {
    signIn('OWNER')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['activeShifts', 4], [{ id: 9 }])
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><TopBarShiftChip pumpId={4} /></MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('link', { name: /1 shift open\.$/ })).toHaveTextContent('1 open')
    expect(shiftApi.getActiveShifts).not.toHaveBeenCalled()
  })
})
