import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import client from '../../api/client'
import { superAdminApi } from '../../api/superAdminApi'
import type { OwnerSummary } from '../../api/superAdminApi'
import { useAuthStore } from '../../store/authStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../test/screenWidth'
import SuperAdminPage from './SuperAdminPage'

vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('../../api/superAdminApi', () => ({
  superAdminApi: { listOwners: vi.fn(), onboardOwner: vi.fn(), addPumpToOwner: vi.fn(), updatePump: vi.fn() },
}))

const owners: OwnerSummary[] = [
  {
    ownerId: 11, employeeId: 'OWN-11', fullName: 'Ramesh Sharma', phoneNumber: '9876500011', status: 'ACTIVE',
    createdAt: '2026-03-01T00:00:00Z',
    pumps: [
      { pumpId: 3, pumpName: 'Sharma Highway', pumpAddress: 'NH 48', enabled: true, staffCount: 6, setupDoneCount: 4, setupRequiredCount: 6 },
    ],
  },
  {
    ownerId: 12, employeeId: 'OWN-12', fullName: 'Lakshmi Rao', phoneNumber: '9876500012', status: 'ACTIVE',
    createdAt: '2026-04-01T00:00:00Z', pumps: [],
  },
]

function CurrentSearch() {
  return <output aria-label="Address search">{useLocation().search}</output>
}

function renderPage(route = '/super-admin') {
  return renderWithProviders(<><SuperAdminPage /><CurrentSearch /></>, { route })
}

function ownerList() {
  return screen.getByRole('navigation', { name: 'Owners' })
}

describe('SuperAdminPage', () => {
  resetScreenWidthAfterEach()

  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Platform Admin', role: 'SUPER_ADMIN', assignedPumpId: null }, isAuthenticated: true })
    vi.mocked(superAdminApi.listOwners).mockResolvedValue(owners)
    vi.mocked(client.get).mockResolvedValue({ data: { totalOwners: 2, totalPumps: 1, totalStaff: 6 } })
  })

  it('shows the owner list beside the chosen owner on desktop', async () => {
    setScreenWidth(1280)
    const user = userEvent.setup()
    renderPage()

    await user.click(await within(ownerList()).findByRole('link', { name: /Ramesh Sharma/ }))

    const detail = screen.getByRole('region', { name: 'Owner details' })
    expect(within(detail).getByRole('heading', { name: 'Ramesh Sharma' })).toBeInTheDocument()
    expect(within(detail).getByText('Sharma Highway')).toBeInTheDocument()
    expect(within(detail).getByText('Setup 4 of 6 done')).toBeInTheDocument()
    expect(within(ownerList()).getByRole('link', { name: /Ramesh Sharma/ })).toHaveAttribute('aria-current', 'page')
    expect(ownerList()).toBeVisible()
    expect(screen.getByLabelText('Address search')).toHaveTextContent('?owner=11')
  })

  it('summarises each owner\'s pumps and setup in the list', async () => {
    setScreenWidth(1280)
    renderPage()

    const ramesh = await within(ownerList()).findByRole('link', { name: /Ramesh Sharma/ })
    expect(within(ramesh).getByText('0 of 1 pumps set up')).toBeInTheDocument()
    expect(screen.getByText('Choose an owner to see their pumps and setup progress.')).toBeInTheDocument()
  })

  it('opens an owner as its own screen on a phone and goes back to the list', async () => {
    setScreenWidth(375)
    const user = userEvent.setup()
    renderPage()

    await user.click(await within(ownerList()).findByRole('link', { name: /Lakshmi Rao/ }))

    expect(screen.getByRole('heading', { name: 'Lakshmi Rao' })).toBeInTheDocument()
    expect(screen.getByText('No pumps added yet.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Owners' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to list' }))

    expect(within(ownerList()).getByRole('link', { name: /Lakshmi Rao/ })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Lakshmi Rao' })).not.toBeInTheDocument()
  })

  it('opens onboarding as a page of its own from the header button', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Onboard new owner' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Onboard new owner' })).toBeInTheDocument()
    expect(screen.getByLabelText('Address search')).toHaveTextContent('?action=onboard-owner')
    expect(screen.queryByRole('navigation', { name: 'Owners' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to owners' })).toHaveAttribute('href', '/super-admin')
  })

  it('checks the onboarding form before sending it', async () => {
    const user = userEvent.setup()
    renderPage('/super-admin?action=onboard-owner')

    await user.click(await screen.findByRole('button', { name: 'Onboard owner' }))

    expect(await screen.findByText('Full name is required')).toBeInTheDocument()
    expect(screen.getByText('Phone number must be exactly 10 digits')).toBeInTheDocument()
    expect(screen.getByText('Pump name is required')).toBeInTheDocument()
    expect(superAdminApi.onboardOwner).not.toHaveBeenCalled()
  })

  it('creates the owner, then shows their login details with the new owner open', async () => {
    setScreenWidth(1280)
    vi.mocked(superAdminApi.onboardOwner).mockResolvedValue({
      ownerId: 12, employeeId: 'OWN-12', fullName: 'Lakshmi Rao', phoneNumber: '9876500012',
      pumpId: 4, pumpName: 'Rao Fuels', createdAt: '2026-11-23T00:00:00Z',
    })
    const user = userEvent.setup()
    renderPage('/super-admin?action=onboard-owner')

    await user.type(await screen.findByLabelText('Full name'), 'Lakshmi Rao')
    await user.type(screen.getByLabelText('Phone number'), '9876500012')
    await user.type(screen.getByLabelText('Initial password'), 'Start@2026')
    await user.type(screen.getByLabelText('Pump name'), 'Rao Fuels')
    await user.type(screen.getByLabelText('Max DU count'), '4')
    await user.type(screen.getByLabelText('Pump address'), 'Pune')
    await user.click(screen.getByRole('button', { name: 'Onboard owner' }))

    expect(await screen.findByText('Owner account created — share these login details')).toBeInTheDocument()
    expect(vi.mocked(superAdminApi.onboardOwner).mock.calls[0][0]).toEqual({
      fullName: 'Lakshmi Rao', phoneNumber: '9876500012', password: 'Start@2026', pumpName: 'Rao Fuels', pumpAddress: 'Pune', maxDuCount: 4,
    })
    expect(screen.getByLabelText('Address search')).toHaveTextContent('?owner=12')
    expect(within(screen.getByRole('region', { name: 'Owner details' })).getByRole('heading', { name: 'Lakshmi Rao' })).toBeInTheDocument()
  })
})
