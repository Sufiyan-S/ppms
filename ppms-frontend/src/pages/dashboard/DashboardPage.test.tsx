import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import type { UserRole } from '../../types/auth'
import DashboardPage from './DashboardPage'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { getMyPumps: vi.fn() } }))
vi.mock('../../components/NotificationBell', () => ({ default: () => <span>Notifications</span> }))
vi.mock('../../components/Toast', () => ({ ToastContainer: () => null }))
vi.mock('./layout/DashboardSidebar', () => ({ DashboardSidebar: () => <nav aria-label="Main" />, DASHBOARD_NAV_ID: 'dashboard-navigation' }))
vi.mock('./layout/UserProfileArea', () => ({ UserProfileArea: () => null }))
vi.mock('./layout/LiveClock', () => ({ LiveClock: () => null }))
vi.mock('./layout/RouteOutlet', () => ({ RouteOutlet: () => <p>Page content</p> }))

const highway = { id: 4, name: 'Highway Pump', createdAt: '2026-01-01T00:00:00Z' } as PumpSummary
const city = { id: 9, name: 'City Pump', createdAt: '2026-02-01T00:00:00Z' } as PumpSummary

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: 4 }, isAuthenticated: true })
}

describe('DashboardPage suspended pump', () => {
  beforeEach(() => usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null }))

  it('shows the page while the selected pump is in use', async () => {
    signIn('OWNER')
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([highway, city])
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('Page content')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('replaces the page with a notice once the server reports the pump suspended, until the owner switches pump', async () => {
    const user = userEvent.setup()
    signIn('OWNER')
    vi.mocked(pumpApi.getMyPumps).mockResolvedValueOnce([highway, city]).mockResolvedValue([city])
    renderWithProviders(<DashboardPage />)
    await screen.findByText('Page content')

    act(() => usePumpStore.getState().markPumpSuspended(4))

    expect(await screen.findByRole('heading', { name: 'This pump is suspended' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Choose another pump')
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument()
    expect(usePumpStore.getState().selectedPumpId).toBe(4)

    await user.click(await screen.findByRole('button', { name: 'Switch to City Pump' }))
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('tells staff to contact the owner when their only pump is suspended', async () => {
    signIn('MANAGER')
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([])
    usePumpStore.setState({ suspendedPumpId: 4 })
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Please contact the pump owner or PPMS support.')
  })
})
