import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { FuelPrice, PumpSummary, SetupChecklist, TankInfo } from '../../api/pumpApi'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import SetupPage from './SetupPage'

vi.mock('../../api/pumpApi', () => ({
  pumpApi: { getMyPumps: vi.fn(), getSetupChecklist: vi.fn(), getCurrentPrices: vi.fn(), getTanks: vi.fn() },
}))
vi.mock('../../api/userApi', () => ({ userApi: { getStaff: vi.fn().mockResolvedValue([{ id: 9, status: 'ACTIVE' }, { id: 10, status: 'INACTIVE' }]) } }))
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

const nozzle = (id: number, tankId: number | null) =>
  ({ id, nozzleNumber: id, fuelType: 'PETROL' as const, lastReading: 0, maxMeterValue: 99999, tankId, status: 'ACTIVE' })

const pump: PumpSummary = {
  id: 3, name: 'Highway Pump', address: 'NH 48', maxDuCount: 4, ownerId: 1, createdAt: '2026-01-01T00:00:00Z',
  discrepancyEscalationThreshold: null, expenseApprovalThreshold: null, gstin: '27AAAAA0000A1Z5',
  dus: [{ id: 1, pumpId: 3, duNumber: 1, name: 'DU-1', status: 'ACTIVE', nozzles: [nozzle(1, 11), nozzle(2, null)] }],
}

const tank = (id: number, tankIdentifier: string, capacity: number) =>
  ({ id, pumpId: 3, tankIdentifier, fuelType: 'PETROL', capacity, currentStock: 0, dipTolerance: 0, status: 'ACTIVE', createdAt: '' }) as TankInfo

const priceSetOn = (effectiveFrom: string): FuelPrice =>
  ({ id: 1, pumpId: 3, fuelType: 'PETROL', pricePerUnit: 102, effectiveFrom, setByUserId: 1 })

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

describe('SetupPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
    usePumpStore.setState({ selectedPumpId: 3 })
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([pump])
    vi.mocked(pumpApi.getSetupChecklist).mockResolvedValue(checklist)
    vi.mocked(pumpApi.getCurrentPrices).mockResolvedValue([])
    vi.mocked(pumpApi.getTanks).mockResolvedValue([tank(11, 'T1', 20000), tank(12, 'T2', 15000)])
  })

  describe('while required steps are still to do', () => {
    it('lists every step in checklist order with its state in words', async () => {
      renderSetup()

      const steps = within(await screen.findByRole('navigation', { name: 'Setup steps' })).getAllByRole('link')
      expect(steps.map((link) => link.textContent)).toEqual([
        'Dispensers & nozzlesDone', 'Tanks & mappingDone', '3Fuel pricesTo do', '4Shift timingsTo do', '5StaffTo do',
        '6GST detailsTo do', '7Credit clientsOptional', '8TankersOptional', '9Pump settingsOptional',
      ])
      expect(steps[0].closest('ol')).not.toBeNull()
    })

    it('shows how many required steps are done on a progress ring', async () => {
      renderSetup()

      const ring = await screen.findByRole('progressbar', { name: 'Setup progress' })
      expect(ring).toHaveAttribute('aria-valuenow', '2')
      expect(ring).toHaveAttribute('aria-valuemax', '6')
      expect(ring).toHaveAttribute('aria-valuetext', '2 of 6 done')
      expect(screen.getByText('2/6')).toBeInTheDocument()
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
      expect(screen.queryByRole('link', { name: /^Back/ })).not.toBeInTheDocument()
    })

    it('moves to the next step and back again', async () => {
      const user = userEvent.setup()
      renderSetup('/dashboard/setup?section=tanks')
      await screen.findByText('Tank editor')

      await user.click(screen.getByRole('link', { name: 'Next step: Fuel prices' }))
      expect(screen.getByText('Price editor')).toBeInTheDocument()
      expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=prices')
      expect(stepLink(/Fuel prices/)).toHaveAttribute('aria-current', 'step')

      await user.click(screen.getByRole('link', { name: 'Back: Tanks & mapping' }))
      expect(screen.getByText('Tank editor')).toBeInTheDocument()
      expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=tanks')
    })

    it('ends the last step with Finish, which says how many steps are left and goes to the first', async () => {
      const user = userEvent.setup()
      renderSetup('/dashboard/setup?section=settings')
      await screen.findByText('Settings editor')

      expect(screen.queryByRole('link', { name: /^Next step/ })).not.toBeInTheDocument()
      const finish = screen.getByRole('link', { name: 'Finish' })
      expect(finish).toHaveAccessibleDescription('4 required steps are still to do')

      await user.click(finish)

      expect(screen.getByText('Price editor')).toBeInTheDocument()
      expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=prices')
    })

    it('jumps straight to any step from the list', async () => {
      const user = userEvent.setup()
      renderSetup('/dashboard/setup?section=nozzles')
      await screen.findByText('Nozzle editor')

      await user.click(stepLink(/Pump settings/))

      expect(screen.getByText('Settings editor')).toBeInTheDocument()
    })

    it('opens and closes the full step list on phones with the All steps button', async () => {
      const user = userEvent.setup()
      renderSetup('/dashboard/setup?section=gst')

      const allSteps = await screen.findByRole('button', { name: 'All steps' })
      expect(allSteps).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByText('Step 6 of 9')).toBeInTheDocument()

      await user.click(allSteps)
      expect(allSteps).toHaveAttribute('aria-expanded', 'true')

      await user.click(stepLink(/Staff/))
      expect(allSteps).toHaveAttribute('aria-expanded', 'false')
    })

    it('opens the staff step with the add form open for ?action=add-staff, and keeps the step when it closes', async () => {
      const user = userEvent.setup()
      renderSetup('/dashboard/setup?action=add-staff')

      await user.click(await screen.findByRole('button', { name: 'Close add form' }))

      expect(screen.getByText('Staff list')).toBeInTheDocument()
      expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=staff')
      expect(await screen.findByRole('button', { name: 'Add staff member' })).toBeInTheDocument()
    })

    it('opens the fuel prices step for ?action=set-fuel-prices', async () => {
      renderSetup('/dashboard/setup?section=gst&action=set-fuel-prices')

      expect(await screen.findByText('Price editor')).toBeInTheDocument()
      expect(stepLink(/Fuel prices/)).toHaveAttribute('aria-current', 'step')
    })

    it('shows the done count in the page header as well as on the stepper', async () => {
      renderSetup()

      expect(await screen.findAllByText('2 of 6 done')).toHaveLength(2)
      expect(screen.getByText('1/4 DUs')).toBeInTheDocument()
    })
  })

  describe('once every required step is done', () => {
    beforeEach(() => {
      vi.mocked(pumpApi.getSetupChecklist).mockResolvedValue(completeChecklist)
    })

    it('opens as a settings hub with a card per area and no stepper', async () => {
      vi.mocked(pumpApi.getCurrentPrices).mockResolvedValue([priceSetOn(new Date().toISOString())])
      renderSetup()

      expect(await screen.findByRole('heading', { level: 2, name: 'All settings' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Setup steps' })).not.toBeInTheDocument()
      expect(screen.getByText('Setup complete')).toBeInTheDocument()
      expect(screen.getByLabelText('Address search')).toBeEmptyDOMElement()

      expect(await screen.findByRole('link', { name: /Tanks & mapping.*2 tanks · 35,000 L capacity.*1 tank has no nozzle/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Dispensers & nozzles.*1 DU · 2 nozzles.*1 nozzle has no tank/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Fuel prices.*Prices updated today/ })).not.toHaveTextContent('Not updated today')
      expect(screen.getByRole('link', { name: /Staff.*1 active staff member/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /GST details.*GSTIN 27AAAAA0000A1Z5/ })).toBeInTheDocument()
      expect(screen.getAllByRole('listitem').filter((entry) => entry.querySelector('.ui-hub-card'))).toHaveLength(9)
    })

    it('flags prices that were not updated today', async () => {
      vi.mocked(pumpApi.getCurrentPrices).mockResolvedValue([priceSetOn('2020-11-21T04:00:00Z')])
      renderSetup()

      expect(await screen.findByRole('link', { name: /Fuel prices.*Prices updated on 21 Nov.*Not updated today/ })).toBeInTheDocument()
    })

    it('opens an area from its card, with an All settings link back to the hub', async () => {
      const user = userEvent.setup()
      renderSetup()

      await user.click(await screen.findByRole('link', { name: /^Tankers/ }))

      expect(screen.getByText('Tanker editor')).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2, name: 'Tankers' })).toBeInTheDocument()
      expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=tankers')
      expect(screen.queryByRole('navigation', { name: 'Setup steps' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^Next step/ })).not.toBeInTheDocument()

      await user.click(screen.getByRole('link', { name: 'All settings' }))

      expect(screen.getByRole('heading', { level: 2, name: 'All settings' })).toBeInTheDocument()
      expect(screen.getByLabelText('Address search')).toBeEmptyDOMElement()
    })

    it('keeps the setup checklist one click away, laid out in one row', async () => {
      const user = userEvent.setup()
      renderSetup()

      const checklistButton = await screen.findByRole('button', { name: 'Setup checklist' })
      expect(checklistButton).toHaveAttribute('aria-expanded', 'false')

      await user.click(checklistButton)

      expect(checklistButton).toHaveAttribute('aria-expanded', 'true')
      const fuelPricesStep = screen.getByRole('link', { name: /Fuel prices\s*Done/ })
      expect(fuelPricesStep).toBeVisible()
      expect(fuelPricesStep.closest('ol')).toHaveClass('ui-stepper--horizontal')
    })

    it('opens the staff area with the add form for ?action=add-staff, and stays there when it closes', async () => {
      const user = userEvent.setup()
      renderSetup('/dashboard/setup?action=add-staff')

      await user.click(await screen.findByRole('button', { name: 'Close add form' }))

      expect(screen.getByText('Staff list')).toBeInTheDocument()
      expect(screen.getByLabelText('Address search')).toHaveTextContent('?section=staff')
      expect(screen.getByRole('link', { name: 'All settings' })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Setup steps' })).not.toBeInTheDocument()
    })

    it('goes back to the stepper when a required step becomes undone', async () => {
      const { queryClient } = renderSetup('/dashboard/setup?section=gst')
      await screen.findByRole('link', { name: 'All settings' })

      vi.mocked(pumpApi.getSetupChecklist).mockResolvedValue(checklist)
      await queryClient.invalidateQueries({ queryKey: ['setup-checklist'] })

      expect(await screen.findByRole('progressbar', { name: 'Setup progress' })).toBeInTheDocument()
      expect(stepLink(/GST details/)).toHaveAttribute('aria-current', 'step')
      expect(screen.queryByRole('link', { name: 'All settings' })).not.toBeInTheDocument()
    })
  })

  it('shows a manager only the fuel prices, without steps or hub', async () => {
    useAuthStore.setState({ user: { userId: 2, fullName: 'Manager', role: 'MANAGER', assignedPumpId: 3 }, isAuthenticated: true })
    renderSetup('/dashboard/setup?action=add-staff')

    expect(await screen.findByText('Price editor')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Setup steps' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'All settings' })).not.toBeInTheDocument()
    expect(screen.queryByText('Staff list')).not.toBeInTheDocument()
    expect(pumpApi.getSetupChecklist).not.toHaveBeenCalled()
  })
})
