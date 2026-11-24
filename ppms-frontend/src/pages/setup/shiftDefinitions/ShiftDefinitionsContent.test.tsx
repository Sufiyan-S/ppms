import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftDefinitionApi } from '../../../api/shiftDefinitionApi'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { ShiftDefinitionsContent } from './ShiftDefinitionsContent'

vi.mock('../../../api/shiftDefinitionApi', () => ({
  shiftDefinitionApi: { getAll: vi.fn(), deleteGroup: vi.fn(), disableGroup: vi.fn(), createBatch: vi.fn() },
}))

const definition = (id: number, name: string, effectiveFrom: string, effectiveTo: string | null): ShiftDefinition => ({
  id, pumpId: 2, name, startTime: '06:00:00', endTime: '13:59:00', crossesMidnight: false, isNightShift: false,
  sortOrder: 1, effectiveFrom, effectiveTo, windowLabel: '6:00 AM – 2:00 PM',
})

describe('ShiftDefinitionsContent', () => {
  beforeEach(() => {
    vi.mocked(shiftDefinitionApi.getAll).mockResolvedValue([
      definition(1, 'Old morning', '2026-01-01', '2026-03-31'),
      definition(2, 'Morning', '2026-04-01', null),
    ])
    vi.mocked(shiftDefinitionApi.deleteGroup).mockResolvedValue(undefined)
  })

  it('opens the active schedule with its timeline and list, and keeps a disabled one collapsed', async () => {
    renderWithProviders(<ShiftDefinitionsContent pumpId={2} />)

    const active = await screen.findByRole('article', { name: 'Schedule from 2026-04-01' })
    expect(within(active).getByRole('img', { name: /Morning: 6:00 AM – 2:00 PM/ })).toBeInTheDocument()
    expect(within(active).getByText('No shift covers 2:00 PM – 6:00 AM')).toBeInTheDocument()

    const disabled = screen.getByRole('article', { name: 'Schedule from 2026-01-01' })
    expect(within(disabled).getByRole('button', { name: /2026-01-01 – 2026-03-31/ })).toHaveAttribute('aria-expanded', 'false')
    expect(within(disabled).queryByText('Old morning')).not.toBeInTheDocument()
  })

  it('asks before deleting a schedule', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ShiftDefinitionsContent pumpId={2} />)

    const active = await screen.findByRole('article', { name: 'Schedule from 2026-04-01' })
    await user.click(within(active).getByRole('button', { name: 'Delete' }))
    expect(within(active).getByText('Delete this schedule?')).toBeInTheDocument()
    await user.click(within(active).getByRole('button', { name: 'Delete schedule' }))

    expect(shiftDefinitionApi.deleteGroup).toHaveBeenCalledWith(2, '2026-04-01', null)
  })
})
