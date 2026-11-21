import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient } from '../../api/pumpApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { EditCreditClientForm } from './EditCreditClientForm'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { updateCreditClient: vi.fn() } }))

const PUMP_ID = 3
const client: CreditClient = {
  id: 40, pumpId: PUMP_ID, name: 'Acme Transport', phone: '9876543210', notes: null,
  createdAt: '2026-01-01T00:00:00Z', parentClientId: null, parentClientName: null,
  isParent: false, isActive: true, hasPortalPin: false, gstin: null, billingAddress: null,
}

describe('EditCreditClientForm GST fields', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.updateCreditClient).mockResolvedValue(client)
  })

  it('sends the GSTIN in capitals and the billing address', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EditCreditClientForm pumpId={PUMP_ID} client={client} onSaved={vi.fn()} />)

    await user.type(screen.getByLabelText(/GSTIN/), '27bbbcs5678d1z2')
    await user.type(screen.getByLabelText(/Billing address/), 'Plot 4, MIDC, Pune')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(pumpApi.updateCreditClient).toHaveBeenCalledWith(PUMP_ID, client.id, expect.objectContaining({
      gstin: '27BBBCS5678D1Z2', billingAddress: 'Plot 4, MIDC, Pune',
    }))
  })

  it('refuses a malformed GSTIN', async () => {
    const user = userEvent.setup()
    renderWithProviders(<EditCreditClientForm pumpId={PUMP_ID} client={client} onSaved={vi.fn()} />)

    await user.type(screen.getByLabelText(/GSTIN/), 'NOTAGSTIN')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent('GSTIN must be 15 characters')
    expect(pumpApi.updateCreditClient).not.toHaveBeenCalled()
  })
})
