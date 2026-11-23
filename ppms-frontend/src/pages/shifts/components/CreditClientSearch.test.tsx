import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../../api/pumpApi'
import type { CreditClientSummary, CreditClientStanding } from '../../../api/pumpApi'
import { useAuthStore } from '../../../store/authStore'
import { usePumpStore } from '../../../store/usePumpStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { UserRole } from '../../../types/auth'
import { CreditClientSearch } from './CreditClientSearch'
import { rememberRecentClient } from './recentCreditClients'

vi.mock('../../../api/pumpApi', () => ({ pumpApi: { getCreditStanding: vi.fn() } }))

function creditClient(id: number, name: string, phone: string | null, extra: Partial<CreditClientSummary> = {}): CreditClientSummary {
  return { id, pumpId: 3, name, phone, parentClientId: null, isParent: false, isActive: true, ...extra } as CreditClientSummary
}

const acme = creditClient(2, 'Acme', null)
const fleet = creditClient(5, 'Fleet Co', '9876543210')
const zenTransport = creditClient(7, 'Zen Transport', '9123400000')
const disabled = creditClient(8, 'Old Traders', null, { isActive: false })

const standings: CreditClientStanding[] = [
  { clientId: 2, creditStatus: 'OK', availableCredit: 600 },
  { clientId: 5, creditStatus: 'OVER_LIMIT', availableCredit: 0 },
  { clientId: 7, creditStatus: 'OVERDUE', availableCredit: null },
  { clientId: 8, creditStatus: 'INACTIVE', availableCredit: null },
]

function signIn(role: UserRole) {
  useAuthStore.setState({ user: { userId: 1, fullName: 'User', role, assignedPumpId: 3 }, isAuthenticated: true })
}

function Picker({ clients, onSelect, blockOverdue }: { clients: CreditClientSummary[]; onSelect: (client: CreditClientSummary) => void; blockOverdue?: boolean }) {
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  return (
    <CreditClientSearch
      search={search}
      creditClients={clients}
      showDropdown={showDropdown}
      onSearchChange={(text) => { setSearch(text); setShowDropdown(true) }}
      onShowDropdownChange={setShowDropdown}
      onSelect={(client) => { setSearch(client.name); setShowDropdown(false); onSelect(client) }}
      inputClassName=""
      placeholder="Search client"
      blockOverdue={blockOverdue}
    />
  )
}

function renderPicker(role: UserRole, options: { blockOverdue?: boolean } = {}) {
  signIn(role)
  const onSelect = vi.fn()
  renderWithProviders(<Picker clients={[acme, fleet, zenTransport, disabled]} onSelect={onSelect} blockOverdue={options.blockOverdue} />)
  return onSelect
}

function mockPhoneWidth(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })
}

describe('CreditClientSearch with no matching client', () => {
  beforeEach(() => vi.mocked(pumpApi.getCreditStanding).mockResolvedValue([]))

  function renderSearchFor(role: UserRole) {
    signIn(role)
    renderWithProviders(
      <CreditClientSearch search="Zenith" creditClients={[acme]} showDropdown
        onSearchChange={vi.fn()} onShowDropdownChange={vi.fn()} onSelect={vi.fn()}
        inputClassName="" placeholder="Search client" />,
    )
  }

  it('tells an operator to ask the manager instead of linking to a page they cannot open', () => {
    renderSearchFor('OPERATOR')

    expect(screen.getByText('No match for "Zenith"')).toBeInTheDocument()
    expect(screen.getByText('Ask your manager to add this client.')).toBeInTheDocument()
    expect(screen.queryByText('+ Add client →')).not.toBeInTheDocument()
  })

  it('offers a manager the link to add the client', () => {
    renderSearchFor('MANAGER')

    expect(screen.getByRole('button', { name: /Add client/ })).toBeInTheDocument()
    expect(screen.queryByText('Ask your manager to add this client.')).not.toBeInTheDocument()
  })
})

describe('CreditClientSearch picking a client', () => {
  beforeEach(() => {
    usePumpStore.setState({ selectedPumpId: 3, suspendedPumpId: null })
    vi.mocked(pumpApi.getCreditStanding).mockResolvedValue(standings)
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('greys out blocked clients with the reason and a call-manager hint, and will not pick them', async () => {
    const onSelect = renderPicker('OPERATOR')
    await userEvent.setup().click(screen.getByRole('combobox'))

    const overLimit = await screen.findByRole('option', { name: /Fleet Co/ })
    expect(overLimit).toHaveAttribute('aria-disabled', 'true')
    expect(overLimit).toHaveTextContent('Over credit limit · ₹0.00 available · Call manager')
    expect(screen.getByRole('option', { name: /Zen Transport/ })).toHaveTextContent('Billing cycle overdue')
    expect(screen.getByRole('option', { name: /Old Traders/ })).toHaveTextContent('Credit disabled')
    expect(screen.getByRole('option', { name: /Acme/ })).toHaveTextContent('₹600.00 available')

    fireEvent.mouseDown(overLimit)
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.mouseDown(screen.getByRole('option', { name: /Acme/ }))
    expect(onSelect).toHaveBeenCalledWith(acme)
  })

  it('leaves the call-manager hint out for a manager', async () => {
    renderPicker('MANAGER')
    await userEvent.setup().click(screen.getByRole('combobox'))

    expect(await screen.findByRole('option', { name: /Fleet Co/ })).not.toHaveTextContent('Call manager')
  })

  it('lets an overdue client be picked at shift close, where only the limit is checked', async () => {
    const onSelect = renderPicker('MANAGER', { blockOverdue: false })
    await userEvent.setup().click(screen.getByRole('combobox'))

    const overdue = await screen.findByRole('option', { name: /Zen Transport/ })
    expect(overdue).not.toHaveAttribute('aria-disabled')
    fireEvent.mouseDown(overdue)
    expect(onSelect).toHaveBeenCalledWith(zenTransport)
  })

  it('finds a client by phone number', async () => {
    renderPicker('OPERATOR')
    await userEvent.setup().type(screen.getByRole('combobox'), '98765')

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getAllByRole('option')).toHaveLength(1)
    expect(within(listbox).getByRole('option', { name: /Fleet Co/ })).toBeInTheDocument()
  })

  it('moves through options with the arrow keys and picks the active one with Enter unless it is blocked', async () => {
    const user = userEvent.setup()
    const onSelect = renderPicker('OPERATOR')
    const combobox = screen.getByRole('combobox')
    await user.click(combobox)
    await screen.findByRole('option', { name: /Fleet Co/ })

    await user.keyboard('{ArrowDown}')
    const first = screen.getByRole('option', { name: /Acme/ })
    expect(combobox).toHaveAttribute('aria-activedescendant', first.id)
    expect(first).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).not.toHaveBeenCalled()

    await user.keyboard('{ArrowUp}{Enter}')
    expect(onSelect).toHaveBeenCalledWith(acme)
  })

  it('closes the list with Escape', async () => {
    const user = userEvent.setup()
    renderPicker('OPERATOR')
    const combobox = screen.getByRole('combobox')
    await user.click(combobox)
    expect(combobox).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')

    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows the clients this user picked recently at this pump as chips that pick in one tap', async () => {
    rememberRecentClient(3, 1, fleet.id)
    rememberRecentClient(3, 1, acme.id)
    const onSelect = renderPicker('OPERATOR')

    const recent = screen.getByRole('group', { name: 'Recent clients' })
    expect(within(recent).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Acme', 'Fleet Co'])
    expect(await within(recent).findByRole('button', { name: 'Fleet Co, Over credit limit' })).toBeDisabled()

    await userEvent.setup().click(within(recent).getByRole('button', { name: 'Acme' }))
    expect(onSelect).toHaveBeenCalledWith(acme)
  })

  it('opens a full-screen sheet on a phone with the search focused and returns focus when closed', async () => {
    mockPhoneWidth(true)
    const user = userEvent.setup()
    renderPicker('OPERATOR')
    const trigger = screen.getByRole('button', { name: 'Search client' })

    await user.click(trigger)

    const sheet = screen.getByRole('dialog', { name: 'Choose client' })
    expect(within(sheet).getByRole('combobox', { name: 'Search client by name or phone' })).toHaveFocus()
    expect(await within(sheet).findByRole('option', { name: /Acme/ })).toHaveClass('min-h-12')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
