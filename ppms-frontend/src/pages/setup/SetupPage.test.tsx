import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary, SetupChecklist } from '../../api/pumpApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import SetupPage from './SetupPage'

vi.mock('../../api/pumpApi', () => ({
  pumpApi: { getMyPumps: vi.fn(), getSetupChecklist: vi.fn(), getCurrentPrices: vi.fn() },
}))
vi.mock('../../api/userApi', () => ({ userApi: { getStaff: vi.fn().mockResolvedValue([{ id: 9 }]) } }))
vi.mock('../../api/shiftDefinitionApi', () => ({ shiftDefinitionApi: { getAll: vi.fn().mockResolvedValue([]) } }))
vi.mock('./nozzles/NozzleContent', () => ({ NozzleContent: () => <p>Nozzle editor</p> }))
vi.mock('./TanksContent', () => ({ TanksContent: () => <p>Tank editor</p> }))
vi.mock('./FuelPricesContent', () => ({ FuelPricesContent: () => <p>Price editor</p> }))
vi.mock('./shiftDefinitions/ShiftDefinitionsContent', () => ({ ShiftDefinitionsContent: () => <p>Shift editor</p> }))
vi.mock('./staff/StaffContent', () => ({
  StaffContent: ({ isAddFormOpen, onCloseAddForm }: { isAddFormOpen: boolean; onCloseAddForm: () => void }) => (
    <div>
      <p>Staff list</p>
      {isAddFormOpen && <button type="button" onClick={onCloseAddForm}>Close add form</button>}
    </div>
  ),
}))
vi.mock('./GstDetailsContent', () => ({ GstDetailsContent: () => <p>GST editor</p> }))
vi.mock('./tankers/TankersContent', () => ({ TankersContent: () => <p>Tanker editor</p> }))
vi.mock('./PumpSettingsContent', () => ({ PumpSettingsContent: () => <p>Settings editor</p> }))

const pump: PumpSummary = {
  id: 3, name: 'Highway Pump', address: 'NH 48', maxDuCount: 4, ownerId: 1, createdAt: '2026-01-01T00:00:00Z',
  discrepancyEscalationThreshold: null, expenseApprovalThreshold: null, gstin: null, dus: [],
}

function item(step: SetupChecklist['items'][number]['step'], done: boolean, optional = false) {
  return { step, done, optional, detail: '', detailCode: 'UNKNOWN', detailParams: {} }
}

const checklist: SetupChecklist = {
  pumpId: 3, doneCount: 2, requiredCount: 6,
  items: [
    item('DISPENSERS', true), item('TANKS', true), item('FUEL_PRICES', false), item('SHIFT_DEFINITIONS', false),
    item('STAFF', false), item('GST_DETAILS', false), item('CREDIT_CLIENTS', false, true),
  ],
}

const completeChecklist: SetupChecklist = {
  ...checklist,
  doneCount: 6,
  items: checklist.items.map((entry) => ({ ...entry, done: !entry.optional })),
}

function CurrentSearch() {
  return <output aria-label="Address search">{useLocation().search}</output>
}

function renderSetup(route = '/dashboard/setup') {
  return renderWithProviders(<><SetupPage /><CurrentSearch /></>, { route })
}

function stepLink(name: RegExp) {
  return within(screen.getByRole('navigation', { name: 'Setup steps' })).getByRole('link', { name })
}

describe('SetupPage steps', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 3 })
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([pump])
    vi.mocked(pumpApi.getSetupChecklist).mockResolvedValue(checklist)
    vi.mocked(pumpApi.getCurrentPrices).mockResolvedValue([])
  })

  it('lists every step in checklist order with its state in words', async () => {
    renderSetup()

    const steps = within(await screen.findByRole('navigation', { name: 'Setup steps' })).getAllByRole('link')
    expect(steps.map((link) => link.textContent)).toEqual([
      '1.Dispensers & nozzlesDone', '2.Tanks & mappingDone', '3.Fuel pricesTo do', '4.Shift timingsTo do', '5.StaffTo do',
      '6.GST detailsTo do', '7.Credit clientsOptional', '8.TankersOptional', '9.Pump settingsOptional',
    ])
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute('aria-valuenow', '2')
  })

  it('starts at the first step still to do and puts it in the address', async () => {
    renderSetup()

    expect(await screen.findByText('Price editor')).toBeInTheDocument()
    expect(stepLink(/Fuel prices/)).toHaveAttribute('aria-current', 'step')
    await waitFor(() => expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=prices'))
  })

  it('opens the step named in the address, even one already done', async () => {
    renderSetup('/dashboard/setup?section=nozzles')

    expect(await screen.findByText('Nozzle editor')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Dispensers & nozzles' })).toBeInTheDocument()
    expect(screen.queryByText('Price editor')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Previous/ })).not.toBeInTheDocument()
  })

  it('moves to the next and previous step', async () => {
    const user = userEvent.setup()
    renderSetup('/dashboard/setup?section=tanks')
    await screen.findByText('Tank editor')

    await user.click(screen.getByRole('link', { name: 'Next step: Fuel prices' }))
    expect(screen.getByText('Price editor')).toBeInTheDocument()
    expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=prices')

    await user.click(screen.getByRole('link', { name: 'Previous: Tanks & mapping' }))
    expect(screen.getByText('Tank editor')).toBeInTheDocument()
  })

  it('jumps straight to any step from the list', async () => {
    const user = userEvent.setup()
    renderSetup('/dashboard/setup?section=nozzles')
    await screen.findByText('Nozzle editor')

    await user.click(stepLink(/Pump settings/))

    expect(screen.getByText('Settings editor')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Next step/ })).not.toBeInTheDocument()
  })

  it('opens the staff step with the add form open for ?action=add-staff, and keeps the step when it closes', async () => {
    const user = userEvent.setup()
    renderSetup('/dashboard/setup?action=add-staff')

    await user.click(await screen.findByRole('button', { name: 'Close add form' }))

    expect(screen.getByText('Staff list')).toBeInTheDocument()
    expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=staff')
    expect(await screen.findByRole('button', { name: 'Add staff' })).toBeInTheDocument()
  })

  it('opens the fuel prices step for ?action=set-fuel-prices', async () => {
    renderSetup('/dashboard/setup?section=gst&action=set-fuel-prices')

    expect(await screen.findByText('Price editor')).toBeInTheDocument()
    expect(stepLink(/Fuel prices/)).toHaveAttribute('aria-current', 'step')
  })

  it('folds the step list into one line once every required step is done, and opens it on request', async () => {
    const user = userEvent.setup()
    vi.mocked(pumpApi.getSetupChecklist).mockResolvedValue(completeChecklist)
    renderSetup('/dashboard/setup?section=gst')

    const review = await screen.findByRole('button', { name: 'Review checklist' })
    expect(screen.getByText('Setup complete')).toBeInTheDocument()
    expect(review).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /Fuel prices/ })).not.toBeInTheDocument()

    await user.click(review)

    expect(review).toHaveAttribute('aria-expanded', 'true')
    expect(stepLink(/GST details/)).toHaveAttribute('aria-current', 'step')
  })

  it('shows the step list without a fold button while a required step is still to do', async () => {
    renderSetup('/dashboard/setup?section=gst')

    expect(await screen.findByRole('progressbar', { name: 'Setup progress' })).toBeInTheDocument()
    expect(stepLink(/Fuel prices/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Review checklist' })).not.toBeInTheDocument()
  })

  it('opens the step list again when a finished setup has a required step undone', async () => {
    vi.mocked(pumpApi.getSetupChecklist).mockResolvedValue(completeChecklist)
    const { queryClient } = renderSetup('/dashboard/setup?section=gst')
    await screen.findByRole('button', { name: 'Review checklist' })

    vi.mocked(pumpApi.getSetupChecklist).mockResolvedValue(checklist)
    await queryClient.invalidateQueries({ queryKey: ['setup-checklist'] })

    expect(await screen.findByRole('progressbar', { name: 'Setup progress' })).toBeInTheDocument()
    expect(stepLink(/Fuel prices/)).toBeVisible()
  })

  it('shows a manager only the fuel prices, without steps', async () => {
    useAuthStore.setState({ user: { userId: 2, fullName: 'Manager', role: 'MANAGER', assignedPumpId: 3 }, isAuthenticated: true })
    renderSetup('/dashboard/setup?action=add-staff')

    expect(await screen.findByText('Price editor')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Setup steps' })).not.toBeInTheDocument()
    expect(screen.queryByText('Staff list')).not.toBeInTheDocument()
    expect(pumpApi.getSetupChecklist).not.toHaveBeenCalled()
  })
})
