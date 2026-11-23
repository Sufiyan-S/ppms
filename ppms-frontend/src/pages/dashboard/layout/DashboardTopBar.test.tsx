import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PumpSummary } from '../../../api/pumpApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { DashboardTopBar } from './DashboardTopBar'

vi.mock('../../../components/NotificationBell', () => ({ default: () => <button type="button">Notifications</button> }))
vi.mock('./UserProfileArea', () => ({ UserProfileArea: () => <button type="button">Open profile menu</button> }))
vi.mock('./TopBarShiftChip', () => ({
  TopBarShiftChip: ({ pumpId }: { pumpId: number | null }) => <a href="/dashboard/shifts">Shift chip for pump {pumpId}</a>,
}))

const highway = { id: 4, name: 'Highway Pump', createdAt: '2026-01-01T00:00:00Z' } as PumpSummary
const city = { id: 9, name: 'City Pump', createdAt: '2026-02-01T00:00:00Z' } as PumpSummary

describe('DashboardTopBar', () => {
  beforeEach(() => sessionStorage.clear())

  it('lays out brand and pump on the left, clock and shift in the centre, actions on the right, and the day line', () => {
    renderWithProviders(<DashboardTopBar switchablePumps={[highway, city]} pumpName="Highway Pump" notificationPumpId={4} />)

    const bar = screen.getByRole('banner')
    const groups = [...bar.children].map((child) => child.className)
    expect(groups).toEqual([
      'ui-dashboard-topbar-left', 'ui-dashboard-topbar-center', 'ui-dashboard-topbar-right', 'ui-topbar-day-progress',
    ])

    const [left, center, right] = [...bar.children] as HTMLElement[]
    expect(within(left).getByText('PPMS')).toBeInTheDocument()
    expect(within(left).getByRole('button', { name: 'Switch to City Pump' })).toBeInTheDocument()
    expect(center.querySelector('time.ui-topbar-clock')).toBeInTheDocument()
    expect(within(center).getByRole('link', { name: 'Shift chip for pump 4' })).toBeInTheDocument()
    expect(within(right).getByRole('button', { name: 'Jump to…' })).toBeInTheDocument()
    expect(within(right).getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(within(right).getByRole('button', { name: 'Open profile menu' })).toBeInTheDocument()
  })

  it('plays its entrance once per browser session, not on every visit to the dashboard', () => {
    const first = renderWithProviders(<DashboardTopBar switchablePumps={[]} pumpName="Highway Pump" notificationPumpId={4} />)
    expect(screen.getByRole('banner')).toHaveClass('ui-dashboard-topbar--entrance')
    first.unmount()

    renderWithProviders(<DashboardTopBar switchablePumps={[]} pumpName="Highway Pump" notificationPumpId={4} />)
    expect(screen.getByRole('banner')).not.toHaveClass('ui-dashboard-topbar--entrance')
  })

  it('swaps in a fresh pump name when the pump changes, so it fades in', () => {
    const queryClient = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
    )
    const { rerender } = render(<DashboardTopBar switchablePumps={[]} pumpName="Highway Pump" notificationPumpId={4} />, { wrapper })
    const firstName = screen.getByText('Highway Pump')
    expect(firstName).toHaveClass('ui-dashboard-topbar-pump__name')

    rerender(<DashboardTopBar switchablePumps={[]} pumpName="City Pump" notificationPumpId={9} />)

    expect(screen.getByText('City Pump')).not.toBe(firstName)
    expect(screen.getByRole('link', { name: 'Shift chip for pump 9' })).toBeInTheDocument()
  })
})
