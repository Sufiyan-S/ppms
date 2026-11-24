import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { useToastStore } from '../../store/toastStore'
import { renderWithProviders } from '../../test/renderWithProviders'
import { PumpSettingsContent } from './PumpSettingsContent'

vi.mock('../../api/pumpApi', () => ({ pumpApi: { updatePumpSettings: vi.fn() } }))

const pump = {
  id: 3, name: 'Pump 3', address: 'Pune', maxDuCount: 4, ownerId: 1, createdAt: '2026-01-01T00:00:00Z',
  discrepancyEscalationThreshold: 500, expenseApprovalThreshold: null, dus: [],
} as PumpSummary

describe('PumpSettingsContent', () => {
  beforeEach(() => {
    vi.mocked(pumpApi.updatePumpSettings).mockResolvedValue(pump)
    useToastStore.setState({ toasts: [] })
  })

  it('enables Save only after the limit changes, then saves it and confirms with a toast', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PumpSettingsContent pump={pump} onUpdated={vi.fn()} />)

    const save = screen.getByRole('button', { name: 'Save settings' })
    expect(save).toBeDisabled()

    const limit = screen.getByRole('spinbutton', { name: /Owner approval limit/ })
    await user.clear(limit)
    await user.type(limit, '750')
    expect(limit).toHaveAccessibleDescription(/above ₹750\.00/)
    expect(save).toBeEnabled()
    await user.click(save)

    expect(pumpApi.updatePumpSettings).toHaveBeenCalledWith(3, { discrepancyEscalationThreshold: 750 })
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual(['Settings saved'])
    expect(save).toBeDisabled()
  })
})
