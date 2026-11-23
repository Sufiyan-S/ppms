import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { TanksContent } from './TanksContent'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { getTanks: vi.fn(), createTank: vi.fn() } }))

const pump = { id: 3, dus: [] } as unknown as PumpSummary

describe('TanksContent', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.getTanks).mockResolvedValue([])
    vi.mocked(pumpApi.createTank).mockResolvedValue({} as never)
  })

  it('keeps Add tank off and lists what is missing until name and capacity are in', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TanksContent pump={pump} />)

    const add = await screen.findByRole('button', { name: 'Add tank' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription(/Tank name or ID.*Capacity/)

    await user.type(screen.getByLabelText('Tank name or ID'), 'T1')
    await user.type(screen.getByRole('spinbutton', { name: 'Capacity' }), '20000')

    expect(screen.getByText('Holds 20,000 L when full')).toBeInTheDocument()
    expect(add).toBeEnabled()
    await user.click(add)

    expect(pumpApi.createTank).toHaveBeenCalledWith(3, { tankIdentifier: 'T1', fuelType: 'PETROL', capacity: 20000, dipTolerance: undefined })
  })
})
