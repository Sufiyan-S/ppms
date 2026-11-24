import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import { GstDetailsContent } from './GstDetailsContent'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { updatePumpSettings: vi.fn() } }))

const pump = {
  id: 3, name: 'Pump 3', address: 'Pune', maxDuCount: 4, ownerId: 1, createdAt: '2026-01-01T00:00:00Z',
  discrepancyEscalationThreshold: null, expenseApprovalThreshold: null, dus: [],
} as PumpSummary

describe('GstDetailsContent', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.updatePumpSettings).mockReset()
    vi.mocked(pumpApi.updatePumpSettings).mockResolvedValue(pump)
    useToastStore.setState({ toasts: [] })
  })

  it('keeps Save off until something changes, then saves with the GSTIN and prefix in capitals and says so', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    renderWithProviders(<GstDetailsContent pump={pump} onUpdated={onUpdated} />)

    const save = screen.getByRole('button', { name: 'Save GST details' })
    expect(save).toBeDisabled()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('GSTIN'), '27aaapl1234c1zv')
    await user.type(screen.getByLabelText('Legal name (as registered)'), 'Lakshmi Fuels Pvt Ltd')
    await user.type(screen.getByLabelText('State'), 'Maharashtra')
    await user.type(screen.getByLabelText('Invoice prefix'), 'pmp3')
    expect(save).toBeEnabled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await user.click(save)

    expect(pumpApi.updatePumpSettings).toHaveBeenCalledWith(3, {
      gstin: '27AAAPL1234C1ZV', legalName: 'Lakshmi Fuels Pvt Ltd', stateName: 'Maharashtra', invoicePrefix: 'PMP3',
    })
    expect(await screen.findByText('PMP3/26-27/0001')).toBeInTheDocument()
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['GST details saved'])
    expect(onUpdated).toHaveBeenCalled()
    expect(save).toBeDisabled()
  })

  it('turns Save off again when a change is undone', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GstDetailsContent pump={{ ...pump, stateName: 'Goa' }} onUpdated={vi.fn()} />)

    const state = screen.getByLabelText('State')
    await user.type(state, 'x')
    expect(screen.getByRole('button', { name: 'Save GST details' })).toBeEnabled()
    await user.type(state, '{Backspace}')
    expect(screen.getByRole('button', { name: 'Save GST details' })).toBeDisabled()
  })

  it('refuses a malformed GSTIN without calling the server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GstDetailsContent pump={pump} onUpdated={vi.fn()} />)

    await user.type(screen.getByLabelText('GSTIN'), '27ABC')
    await user.click(screen.getByRole('button', { name: 'Save GST details' }))

    expect(screen.getByRole('alert')).toHaveTextContent('GSTIN must be 15 characters')
    expect(pumpApi.updatePumpSettings).not.toHaveBeenCalled()
  })
})
