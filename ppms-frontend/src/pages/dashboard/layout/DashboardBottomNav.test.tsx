import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import type { UserRole } from '../../../types/auth'
import { DashboardBottomNav } from './DashboardBottomNav'

function renderBottomNav(role: UserRole, path = '/dashboard', onOpenDrawer = vi.fn()) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: 4 }, isAuthenticated: true })
  render(
    <MemoryRouter initialEntries={[path]}>
      <DashboardBottomNav drawerOpen={false} onOpenDrawer={onOpenDrawer} moreButtonRef={{ current: null }} />
    </MemoryRouter>,
  )
  return onOpenDrawer
}

function tabNames() {
  const nav = screen.getByRole('navigation', { name: 'Quick' })
  return within(nav).getAllByRole('link').map((link) => link.textContent)
}

describe('DashboardBottomNav', () => {
  it.each<[UserRole, string[]]>([
    ['OPERATOR', ['My shift', 'Expenses', 'Plan']],
    ['MANAGER', ['Home', 'Shifts', 'Stock', 'Cash']],
    ['OWNER', ['Home', 'Shifts', 'Credit', 'Reports']],
    ['ADMIN', ['Home', 'Shifts', 'Credit', 'Reports']],
    ['ACCOUNTANT', ['Home', 'Credit', 'Expenses']],
  ])('gives %s the tabs %j plus More', (role, tabs) => {
    renderBottomNav(role)
    expect(tabNames()).toEqual(tabs)
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })

  it('marks only the tab of the current page as the current page', () => {
    renderBottomNav('MANAGER', '/dashboard/inventory')
    expect(screen.getByRole('link', { name: 'Stock' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: 'More' })).not.toHaveClass('ui-bottom-nav-item--active')
  })

  it('highlights More on a page that has no tab', () => {
    renderBottomNav('MANAGER', '/dashboard/setup')
    expect(screen.queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toHaveClass('ui-bottom-nav-item--active')
  })

  it('opens the full menu drawer from More', async () => {
    const onOpenDrawer = renderBottomNav('OPERATOR', '/dashboard/my-shift')
    const more = screen.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-controls', 'dashboard-navigation')
    expect(more).toHaveAttribute('aria-expanded', 'false')

    await userEvent.setup().click(more)

    expect(onOpenDrawer).toHaveBeenCalledTimes(1)
  })
})
