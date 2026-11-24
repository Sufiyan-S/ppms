import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PumpSummary } from '../../../api/pumpApi'
import { userApi } from '../../../api/userApi'
import type { StaffMember } from '../../../api/userApi'
import { useAuthStore } from '../../../store/authStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { StaffContent } from './StaffContent'

vi.mock('../../../api/userApi', () => ({ userApi: { getStaff: vi.fn(), updateUserStatus: vi.fn() } }))
vi.mock('../../../api/shiftDefinitionApi', () => ({ shiftDefinitionApi: { getActive: vi.fn().mockResolvedValue([]) } }))

const pump = { id: 2, name: 'Pump 2', address: 'Pune', dus: [] } as unknown as PumpSummary

const person = (id: number, fullName: string, role: string, status = 'ACTIVE'): StaffMember => ({
  id, employeeId: `EMP-${id}`, fullName, phoneNumber: `98000000${String(id).padStart(2, '0')}`, gender: 'MALE',
  nightShiftConsent: true, role, assignedPumpId: 2, status, dailyRate: null, shift1HourlyRate: null, standardHourlyRate: null,
})

const sixStaff = [
  person(1, 'Ravi Kumar', 'OPERATOR'),
  person(2, 'Sunita Patil', 'MANAGER'),
  person(3, 'Amit Shah', 'OPERATOR', 'INACTIVE'),
  person(4, 'Meena Joshi', 'ACCOUNTANT'),
  person(5, 'Kiran Rao', 'OPERATOR'),
  person(6, 'Vijay Pawar', 'OPERATOR'),
]

function shownNames() {
  return within(screen.getByRole('list', { name: 'Staff members' })).getAllByRole('listitem').map((row) => row.getAttribute('aria-label'))
}

describe('StaffContent', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { userId: 1, fullName: 'Owner', role: 'OWNER', assignedPumpId: null }, isAuthenticated: true })
  })

  it('shows no toolbar for a short list', async () => {
    vi.mocked(userApi.getStaff).mockResolvedValue(sixStaff.slice(0, 3))
    renderWithProviders(<StaffContent pump={pump} isAddFormOpen={false} onCloseAddForm={vi.fn()} />)

    expect(await screen.findByRole('listitem', { name: 'Ravi Kumar' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox', { name: 'Search staff' })).not.toBeInTheDocument()
  })

  it('searches and filters a long list by role and status', async () => {
    const user = userEvent.setup()
    vi.mocked(userApi.getStaff).mockResolvedValue(sixStaff)
    renderWithProviders(<StaffContent pump={pump} isAddFormOpen={false} onCloseAddForm={vi.fn()} />)

    await user.type(await screen.findByRole('searchbox', { name: 'Search staff' }), 'patil')
    expect(shownNames()).toEqual(['Sunita Patil'])
    expect(screen.getByText('1 of 6 shown')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await user.click(within(screen.getByRole('group', { name: 'Role' })).getByRole('button', { name: 'Operator' }))
    expect(shownNames()).toEqual(['Ravi Kumar', 'Amit Shah', 'Kiran Rao', 'Vijay Pawar'])

    await user.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Inactive' }))
    expect(shownNames()).toEqual(['Amit Shah'])
    expect(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Inactive' })).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByRole('searchbox', { name: 'Search staff' }), 'nobody')
    expect(screen.getByText('No staff match these filters.')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    expect(shownNames()).toHaveLength(6)
  })

  it('says there are no staff yet and shows the add form', async () => {
    vi.mocked(userApi.getStaff).mockResolvedValue([])
    renderWithProviders(<StaffContent pump={pump} isAddFormOpen={false} onCloseAddForm={vi.fn()} />)

    expect(await screen.findByText('No staff yet')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Add staff member' })).toBeInTheDocument()
  })
})
