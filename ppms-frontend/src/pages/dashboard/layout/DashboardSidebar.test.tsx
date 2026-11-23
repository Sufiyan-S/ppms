import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PumpSummary } from '../../../api/pumpApi'
import { useAuthStore } from '../../../store/authStore'
import { usePumpStore } from '../../../store/usePumpStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../../test/screenWidth'
import type { UserRole } from '../../../types/auth'
import { DashboardSidebar } from './DashboardSidebar'

const pumps = [{ id: 4, name: 'Highway Pump' }, { id: 9, name: 'City Pump' }] as PumpSummary[]

function renderSidebar(drawerOpen: boolean, onCloseDrawer = vi.fn()) {
  renderWithProviders(
    <DashboardSidebar pumpName="Highway Pump" switchablePumps={pumps} drawerOpen={drawerOpen} onCloseDrawer={onCloseDrawer} />,
  )
  return onCloseDrawer
}

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: 4 }, isAuthenticated: true })
}

function groupNames() {
  return within(screen.getByRole('navigation', { name: 'Main' }))
    .queryAllByRole('button', { expanded: true })
    .map((button) => button.textContent)
}

describe('DashboardSidebar as a phone drawer', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null })
  })

  it('labels every link with text and marks the open state', () => {
    renderSidebar(true)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toHaveClass('ui-dashboard-sidebar--open')
    expect(screen.getByRole('link', { name: 'Shifts' })).toBeInTheDocument()
    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.queryByText('Owner workspace')).not.toBeInTheDocument()
  })

  it('moves focus into the drawer when it opens', () => {
    renderSidebar(true)
    expect(screen.getByRole('navigation', { name: 'Main' })).toContainElement(document.activeElement as HTMLElement)
  })

  it('closes after choosing a page, on Escape and from the close button', async () => {
    const user = userEvent.setup()
    const onClose = renderSidebar(true)

    await user.click(screen.getByRole('link', { name: 'Shifts' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close menu' }))

    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('ignores Escape while closed', async () => {
    const user = userEvent.setup()
    const onClose = renderSidebar(false)
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lets an owner switch pump from inside the drawer', async () => {
    const user = userEvent.setup()
    renderSidebar(true)
    await user.click(screen.getByRole('button', { name: 'Switch to City Pump' }))
    expect(usePumpStore.getState().selectedPumpId).toBe(9)
  })
})

describe('DashboardSidebar groups', () => {
  beforeEach(() => usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null }))

  it('groups an owner’s pages under Operations, Money, Reports and Admin', () => {
    signIn('OWNER')
    renderSidebar(false)

    expect(groupNames()).toEqual(['Operations', 'Money', 'Reports', 'Admin'])
    const money = document.getElementById(screen.getByRole('button', { name: 'Money' }).getAttribute('aria-controls')!)!
    expect(within(money).getAllByRole('link').map((link) => link.textContent))
      .toEqual(['Credit', 'Settlements', 'Expenses', 'Approvals', 'Payroll'])
  })

  it('leaves out the pages and groups a role cannot open', () => {
    signIn('OPERATOR')
    renderSidebar(false)

    expect(groupNames()).toEqual(['Operations', 'Money', 'Admin'])
    expect(screen.getByRole('link', { name: 'My Shift' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Payroll' })).not.toBeInTheDocument()
  })

  it('opens and closes a group from its header and remembers it on this device', async () => {
    const user = userEvent.setup()
    signIn('OWNER')
    renderSidebar(false)

    const reports = screen.getByRole('button', { name: 'Reports' })
    await user.click(reports)

    expect(reports).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'Balance Sheets' })).not.toBeInTheDocument()
    expect(localStorage.getItem('ppms_sidebar_closed_groups')).toBe('["reports"]')

    cleanup()
    renderSidebar(false)
    expect(screen.getByRole('button', { name: 'Reports' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('DashboardSidebar icon rail', () => {
  resetScreenWidthAfterEach()
  beforeEach(() => {
    signIn('OWNER')
    usePumpStore.setState({ selectedPumpId: 4, suspendedPumpId: null })
  })

  it('folds to an icon rail on desktop, keeping each link named, and remembers the choice', async () => {
    setScreenWidth(1280)
    const user = userEvent.setup()
    renderSidebar(false)

    const nav = screen.getByRole('navigation', { name: 'Main' })
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(nav).not.toHaveClass('ui-dashboard-sidebar--rail')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)

    expect(nav).toHaveClass('ui-dashboard-sidebar--rail')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'Credit' })).toHaveAttribute('title', 'Credit')
    expect(localStorage.getItem('ppms_sidebar_collapsed')).toBe('true')

    cleanup()
    renderSidebar(false)
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass('ui-dashboard-sidebar--rail')
  })

  it('starts as an icon rail on a tablet until the user widens it', async () => {
    setScreenWidth(900)
    const user = userEvent.setup()
    renderSidebar(false)

    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveClass('ui-dashboard-sidebar--rail')
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveClass('ui-dashboard-sidebar--rail')
    expect(localStorage.getItem('ppms_sidebar_collapsed')).toBe('false')
  })

  it('stays a full drawer on a phone, without the rail toggle', () => {
    setScreenWidth(390)
    localStorage.setItem('ppms_sidebar_collapsed', 'true')
    renderSidebar(true)

    expect(screen.getByRole('navigation', { name: 'Main' })).not.toHaveClass('ui-dashboard-sidebar--rail')
    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument()
  })
})
