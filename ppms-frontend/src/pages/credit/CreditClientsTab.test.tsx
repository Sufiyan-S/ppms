import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient } from '../../api/pumpApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { CreditClientsTab } from './CreditClientsTab'

vi.mock('../../api/pumpApi', () => ({
  pumpApi: {
    getCreditClientAccounts: vi.fn(),
    toggleCreditClientStatus: vi.fn(),
    setCreditClientPortalPin: vi.fn(),
    removeCreditClientPortalPin: vi.fn(),
    createCreditClient: vi.fn(),
    updateCreditClient: vi.fn(),
  },
}))

const PUMP_ID = 3

function creditClient(overrides: Partial<CreditClient>): CreditClient {
  return {
    id: 40, pumpId: PUMP_ID, name: 'Acme Transport', phone: '9876543210', notes: null,
    createdAt: '2026-01-01T00:00:00Z', parentClientId: null, parentClientName: null,
    isParent: false, isActive: true, hasPortalPin: false,
    ...overrides,
  }
}

const parent = creditClient({ id: 40, name: 'Acme Transport', isParent: true, hasPortalPin: true })
const driver = creditClient({ id: 41, name: 'Driver 1', parentClientId: 40, parentClientName: 'Acme Transport' })

function renderTab() {
  return renderWithProviders(<CreditClientsTab pumpId={PUMP_ID} canManageClients canManagePortalPins />)
}

async function openMenuFor(name: string) {
  const user = userEvent.setup()
  renderTab()
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}` }))
  return { user, menu: screen.getByRole('menu', { name: `Actions for ${name}` }) }
}

describe('CreditClientsTab', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getCreditClientAccounts).mockResolvedValue([parent, driver])
    vi.mocked(pumpApi.toggleCreditClientStatus).mockResolvedValue(undefined as never)
    vi.mocked(pumpApi.setCreditClientPortalPin).mockResolvedValue(undefined)
    vi.mocked(pumpApi.removeCreditClientPortalPin).mockResolvedValue(undefined)
  })

  it('keeps every client action in one menu instead of a row of buttons', async () => {
    const { menu } = await openMenuFor('Acme Transport')

    expect(within(menu).getAllByRole('menuitem').map(item => item.querySelector('.font-semibold')?.textContent))
      .toEqual(['Edit details', 'Add sub-account', 'Change PIN', 'Remove PIN', 'Disable'])
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByText('Portal PIN set')).toBeInTheDocument()
  })

  it('opens the edit form from the menu and closes it on Cancel', async () => {
    const { user, menu } = await openMenuFor('Acme Transport')

    await user.click(within(menu).getByRole('menuitem', { name: /Edit details/ }))
    expect(screen.getByDisplayValue('Acme Transport')).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByDisplayValue('Acme Transport')).not.toBeInTheDocument()
  })

  it('asks before disabling a client from the menu', async () => {
    const { user, menu } = await openMenuFor('Acme Transport')

    await user.click(within(menu).getByRole('menuitem', { name: /Disable/ }))
    const panel = screen.getByRole('region', { name: 'Disable this client?' })
    expect(pumpApi.toggleCreditClientStatus).not.toHaveBeenCalled()

    await user.click(within(panel).getByRole('button', { name: 'Disable' }))
    expect(pumpApi.toggleCreditClientStatus).toHaveBeenCalledWith(PUMP_ID, parent.id, false)
  })

  it('removes a portal PIN only after confirming', async () => {
    const { user, menu } = await openMenuFor('Acme Transport')

    await user.click(within(menu).getByRole('menuitem', { name: /Remove PIN/ }))
    const panel = screen.getByRole('region', { name: 'Remove portal PIN for Acme Transport' })
    expect(pumpApi.removeCreditClientPortalPin).not.toHaveBeenCalled()

    await user.click(within(panel).getByRole('button', { name: 'Remove PIN' }))
    expect(pumpApi.removeCreditClientPortalPin).toHaveBeenCalledWith(PUMP_ID, parent.id)
  })

  it('sets a portal PIN for a client without one from the menu', async () => {
    vi.mocked(pumpApi.getCreditClientAccounts).mockResolvedValue([creditClient({ hasPortalPin: false })])
    const { user, menu } = await openMenuFor('Acme Transport')
    expect(within(menu).queryByRole('menuitem', { name: /Remove PIN/ })).not.toBeInTheDocument()

    await user.click(within(menu).getByRole('menuitem', { name: /Set portal PIN/ }))
    await user.type(screen.getByLabelText('Portal PIN'), '48a21')
    await user.click(screen.getByRole('button', { name: 'Save PIN' }))

    expect(pumpApi.setCreditClientPortalPin).toHaveBeenCalledWith(PUMP_ID, 40, '4821')
  })

  it('refuses a portal PIN shorter than 4 digits without calling the server', async () => {
    const { user, menu } = await openMenuFor('Acme Transport')

    await user.click(within(menu).getByRole('menuitem', { name: /Change PIN/ }))
    await user.type(screen.getByLabelText('Portal PIN'), '123')
    await user.click(screen.getByRole('button', { name: 'Save PIN' }))

    expect(screen.getByRole('alert')).toHaveTextContent('PIN must be 4 to 6 digits')
    expect(pumpApi.setCreditClientPortalPin).not.toHaveBeenCalled()
  })

  it('enables a disabled client with one visible button', async () => {
    const user = userEvent.setup()
    vi.mocked(pumpApi.getCreditClientAccounts).mockResolvedValue([creditClient({ isActive: false })])
    renderTab()

    await user.click(await screen.findByRole('button', { name: 'Enable client Acme Transport' }))
    expect(pumpApi.toggleCreditClientStatus).toHaveBeenCalledWith(PUMP_ID, 40, true)
  })

  it('expands sub-accounts from a toggle that reports its state and hides the tree glyph from screen readers', async () => {
    const user = userEvent.setup()
    renderTab()

    const toggle = await screen.findByRole('button', { name: /^Acme Transport/, expanded: false })
    const subAccounts = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(subAccounts).toBeEmptyDOMElement()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(subAccounts as HTMLElement).getByText('Driver 1')).toBeInTheDocument()
    expect(within(subAccounts as HTMLElement).getByText('└')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Actions for Driver 1' })).toBeInTheDocument()
  })
})
