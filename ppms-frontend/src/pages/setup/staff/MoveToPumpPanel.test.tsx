import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../../api/pumpApi'
import { userApi } from '../../../api/userApi'
import type { StaffMember } from '../../../api/userApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { MoveToPumpPanel } from './MoveToPumpPanel'

vi.mock('../../../api/userApi', () => ({
  userApi: { moveToPump: vi.fn() },
}))
vi.mock('../../../api/pumpApi', () => ({
  pumpApi: { getMyPumps: vi.fn() },
}))

const member = { id: 11, fullName: 'Ravi Kumar', role: 'OPERATOR' } as StaffMember

describe('MoveToPumpPanel', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getMyPumps).mockResolvedValue([
      { id: 2, name: 'Highway Fuels' },
      { id: 3, name: 'City Fuels' },
    ] as Awaited<ReturnType<typeof pumpApi.getMyPumps>>)
    vi.mocked(userApi.moveToPump).mockResolvedValue(undefined as never)
  })

  it('says a pump is still needed until one is chosen, then shows where the staff member moves', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MoveToPumpPanel pumpId={2} member={member} onClose={vi.fn()} />)

    const move = screen.getByRole('button', { name: 'Move staff' })
    await screen.findByRole('button', { name: /^Move to pump/ })
    expect(move).toBeDisabled()
    expect(move).toHaveAccessibleDescription(/Still needed.*Move to pump/)

    await user.click(screen.getByRole('button', { name: /^Move to pump/ }))
    await user.click(await screen.findByRole('option', { name: 'City Fuels' }))

    expect(screen.getByText('Moves from Highway Fuels to City Fuels')).toBeInTheDocument()
    expect(move).toBeEnabled()

    await user.click(move)
    expect(userApi.moveToPump).toHaveBeenCalledWith(11, 3)
  })
})
