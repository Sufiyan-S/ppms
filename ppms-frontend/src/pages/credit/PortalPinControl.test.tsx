import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient } from '../../api/pumpApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { PortalPinControl } from './PortalPinControl'

vi.mock('../../api/pumpApi', () => ({
  pumpApi: { setCreditClientPortalPin: vi.fn(), removeCreditClientPortalPin: vi.fn() },
}))

const PUMP_ID = 3
const client: CreditClient = {
  id: 40, pumpId: PUMP_ID, name: 'Acme Transport', phone: '9876543210', notes: null,
  createdAt: '2026-01-01T00:00:00Z', parentClientId: null, parentClientName: null,
  isParent: false, isActive: true, hasPortalPin: false,
}

describe('PortalPinControl', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.setCreditClientPortalPin).mockResolvedValue(undefined)
    vi.mocked(pumpApi.removeCreditClientPortalPin).mockResolvedValue(undefined)
  })

  it('offers to set a PIN and no removal for a client without one', () => {
    renderWithProviders(<PortalPinControl pumpId={PUMP_ID} client={client} />)
    expect(screen.getByText('No portal PIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set portal PIN' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove portal PIN/ })).not.toBeInTheDocument()
  })

  it('saves a 4 to 6 digit PIN, keeping only the digits typed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PortalPinControl pumpId={PUMP_ID} client={client} />)

    await user.click(screen.getByRole('button', { name: 'Set portal PIN' }))
    const pin = screen.getByLabelText('Portal PIN')
    expect(pin).toHaveAttribute('type', 'password')
    expect(pin).toHaveAttribute('inputmode', 'numeric')
    await user.type(pin, '48a21')
    await user.click(screen.getByRole('button', { name: 'Save PIN' }))

    expect(pumpApi.setCreditClientPortalPin).toHaveBeenCalledWith(PUMP_ID, client.id, '4821')
  })

  it('refuses a PIN shorter than 4 digits without calling the server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PortalPinControl pumpId={PUMP_ID} client={client} />)

    await user.click(screen.getByRole('button', { name: 'Set portal PIN' }))
    await user.type(screen.getByLabelText('Portal PIN'), '123')
    await user.click(screen.getByRole('button', { name: 'Save PIN' }))

    expect(screen.getByRole('alert')).toHaveTextContent('PIN must be 4 to 6 digits')
    expect(pumpApi.setCreditClientPortalPin).not.toHaveBeenCalled()
  })

  it('lets a client with a PIN have it changed or removed after confirming', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PortalPinControl pumpId={PUMP_ID} client={{ ...client, hasPortalPin: true }} />)
    expect(screen.getByText('Portal PIN set')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove portal PIN for Acme Transport' }))
    expect(pumpApi.removeCreditClientPortalPin).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Yes' }))

    expect(pumpApi.removeCreditClientPortalPin).toHaveBeenCalledWith(PUMP_ID, client.id)
  })
})
