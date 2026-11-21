import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PumpSummary } from '../../../api/pumpApi'
import { useAuthStore } from '../../../store/authStore'
import { usePumpStore } from '../../../store/usePumpStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { DashboardSidebar } from './DashboardSidebar'

const pumps = [{ id: 4, name: 'Highway Pump' }, { id: 9, name: 'City Pump' }] as PumpSummary[]

function renderSidebar(drawerOpen: boolean, onCloseDrawer = vi.fn()) {
  renderWithProviders(
    <DashboardSidebar pumpName="Highway Pump" switchablePumps={pumps} drawerOpen={drawerOpen} onCloseDrawer={onCloseDrawer} />,
  )
  return onCloseDrawer
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
    expect(screen.getByText('Owner workspace')).toBeInTheDocument()
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
