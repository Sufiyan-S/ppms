import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftPlanApi } from '../../../api/shiftPlanApi'
import type { StaffMember } from '../../../api/userApi'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { PreferencesPanel } from './PreferencesPanel'

vi.mock('../../../api/shiftPlanApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/shiftPlanApi')>()
  return { ...actual, shiftPlanApi: { getPreference: vi.fn(), setPreference: vi.fn() } }
})

const PUMP_ID = 2
const member = { id: 11, fullName: 'Ravi Kumar' } as StaffMember
const nightShift = { id: 7, name: 'Night', windowLabel: '21:00 – 09:00' } as ShiftDefinition

describe('PreferencesPanel', () => {
  beforeEach(() => {
    vi.mocked(shiftPlanApi.getPreference).mockResolvedValue({
      userId: member.id, pumpId: PUMP_ID, preferredShiftDefinitionId: nightShift.id, preferredDayOff: 'MONDAY',
    })
    vi.mocked(shiftPlanApi.setPreference).mockResolvedValue({
      userId: member.id, pumpId: PUMP_ID, preferredShiftDefinitionId: nightShift.id, preferredDayOff: 'FRIDAY',
    })
  })

  it('shows the saved preference when it opens', async () => {
    renderWithProviders(<PreferencesPanel pumpId={PUMP_ID} member={member} activeShiftDefs={[nightShift]} onClose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /Preferred shift: Night/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Preferred day off: Monday/ })).toBeInTheDocument()
  })

  it('keeps the saved preferred shift when only the day off is changed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PreferencesPanel pumpId={PUMP_ID} member={member} activeShiftDefs={[nightShift]} onClose={vi.fn()} />)

    await user.click(await screen.findByRole('button', { name: /Preferred day off/ }))
    await user.click(await screen.findByRole('option', { name: 'Friday' }))
    await user.click(screen.getByRole('button', { name: 'Save preferences' }))

    expect(shiftPlanApi.setPreference).toHaveBeenCalledWith(PUMP_ID, member.id, nightShift.id, 'FRIDAY')
  })
})
