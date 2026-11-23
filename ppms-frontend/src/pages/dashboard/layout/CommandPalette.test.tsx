import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../../../store/authStore'
import { useVisibleLayout } from '../../../test/layout'
import type { UserRole } from '../../../types/auth'
import { CommandPaletteLauncher } from './CommandPaletteLauncher'
import { commandItemsFor } from './commandItems'

function CurrentPath() {
  const { pathname, search } = useLocation()
  return <output aria-label="Address">{pathname + search}</output>
}

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: 4 }, isAuthenticated: true })
}

function renderLauncher() {
  render(<MemoryRouter initialEntries={['/dashboard']}><CommandPaletteLauncher /><CurrentPath /></MemoryRouter>)
}

function optionNames() {
  return within(screen.getByRole('listbox')).queryAllByRole('option').map((option) => option.textContent)
}

describe('commandItemsFor', () => {
  it('offers an operator only their own pages and no manager tasks', () => {
    const labels = commandItemsFor('OPERATOR').map((item) => item.label)
    expect(labels).toEqual(expect.arrayContaining(['My Shift', 'Shifts', 'Expenses', 'Notifications']))
    expect(labels).not.toContain('Overview')
    expect(labels).not.toContain('Open shift')
    expect(labels).not.toContain('Record delivery')
  })

  it('offers a manager the forecourt, money and stock tasks they may do', () => {
    const actions = commandItemsFor('MANAGER').filter((item) => item.kind === 'action')
    expect(actions.map((item) => item.label)).toEqual([
      'Open shift', 'Record delivery', 'Record dip check', 'Record payment', 'Record settlement',
      'Add expense', 'Record cash entry', 'Sell a product', 'Generate balance sheet', 'Set fuel prices',
    ])
    expect(actions[0].path).toBe('/dashboard/shifts?action=open-shift')
  })

  it('keeps an accountant to the pages they can open', () => {
    const items = commandItemsFor('ACCOUNTANT')
    expect(items.filter((item) => item.kind === 'action')).toEqual([])
    expect(items.map((item) => item.label)).not.toContain('Payroll')
  })
})

describe('CommandPalette', () => {
  useVisibleLayout()
  beforeEach(() => signIn('MANAGER'))

  it('opens from the top bar button as a labelled dialog with focus in the search box', async () => {
    const user = userEvent.setup()
    renderLauncher()

    await user.click(screen.getByRole('button', { name: 'Jump to…' }))

    expect(screen.getByRole('dialog', { name: 'Jump to a page or action' })).toBeInTheDocument()
    const search = screen.getByRole('combobox', { name: 'Search pages and actions' })
    expect(search).toHaveFocus()
    expect(search).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'Pages' })).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).getByRole('group', { name: 'Quick actions' })).toBeInTheDocument()
  })

  it('opens with Ctrl+K and with ⌘K', async () => {
    const user = userEvent.setup()
    renderLauncher()

    await user.keyboard('{Control>}k{/Control}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.keyboard('{Meta>}k{/Meta}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('filters by what is typed and says when nothing matches', async () => {
    const user = userEvent.setup()
    renderLauncher()
    await user.click(screen.getByRole('button', { name: 'Jump to…' }))

    await user.type(screen.getByRole('combobox'), 'cash')
    expect(optionNames()).toEqual(['Cash Drawer', 'Record cash entry'])
    expect(screen.getByText('2 results')).toBeInTheDocument()

    await user.clear(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'payroll')
    expect(optionNames()).toEqual([])
    expect(screen.getByText('No page or action matches.')).toBeInTheDocument()
  })

  it('moves through the results with the arrow keys and opens the active one with Enter', async () => {
    const user = userEvent.setup()
    renderLauncher()
    await user.click(screen.getByRole('button', { name: 'Jump to…' }))
    const search = screen.getByRole('combobox')

    await user.type(search, 'shift')
    const [shifts, planning, openShift] = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(shifts).toHaveAttribute('aria-selected', 'true')
    expect(search).toHaveAttribute('aria-activedescendant', shifts.id)

    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(openShift).toHaveAttribute('aria-selected', 'true')
    expect(search).toHaveAttribute('aria-activedescendant', openShift.id)
    await user.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}')
    expect(planning).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')

    await user.keyboard('{Enter}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('/dashboard/shifts?action=open-shift')
  })

  it('opens a page when its option is clicked', async () => {
    const user = userEvent.setup()
    renderLauncher()
    await user.click(screen.getByRole('button', { name: 'Jump to…' }))

    await user.click(screen.getByRole('option', { name: 'Inventory' }))

    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('/dashboard/inventory')
  })
})
