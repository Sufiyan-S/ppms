import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { PlanningGrid } from './PlanningGrid'
import type { ShiftPlanning } from './useShiftPlanning'

function definition(overrides: Partial<ShiftDefinition>): ShiftDefinition {
  return {
    id: 1, pumpId: 3, name: 'Morning', startTime: '06:00:00', endTime: '14:00:00', crossesMidnight: false,
    isNightShift: false, sortOrder: 1, effectiveFrom: '2026-01-01', effectiveTo: null, windowLabel: '',
    ...overrides,
  }
}

function renderGrid(sortedDefs: ShiftDefinition[]) {
  const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']
  const form = {
    isOwnerOrAdmin: true, setEditSlot: vi.fn(), slotError: null, setSlotError: vi.fn(), addOpId: '', setAddOpId: vi.fn(),
    operatorStaff: [], staffById: {}, plan: null, planLoading: false, sortedDefs,
    removeEntryMutation: { mutate: vi.fn(), isPending: false }, addEntryMutation: { mutate: vi.fn(), isPending: false },
    days, today: '2026-11-23', entryMap: {}, actualMap: {}, isEditingSlot: () => false,
  } as unknown as ShiftPlanning
  return renderWithProviders(<PlanningGrid form={form} />)
}

describe('PlanningGrid', () => {
  it('labels the shift column in sentence case', () => {
    renderGrid([definition({})])
    expect(screen.getByRole('columnheader', { name: 'Shift' })).not.toHaveClass('uppercase')
  })

  it('marks a night shift with a moon icon instead of repeating Night as a badge', () => {
    renderGrid([definition({ id: 2, name: 'Night', startTime: '23:00:00', endTime: '09:00:00', crossesMidnight: true, isNightShift: true })])
    const row = screen.getByRole('rowheader', { name: /Night/ })

    expect(within(row).getByRole('img', { name: 'Night shift' })).toBeInTheDocument()
    expect(within(row).getAllByText(/Night/)).toHaveLength(1)
  })

  it('shows the shift time on one line with a next-day marker when it crosses midnight', () => {
    renderGrid([definition({ id: 2, name: 'Night', startTime: '23:00:00', endTime: '09:00:00', crossesMidnight: true, isNightShift: true })])
    const time = screen.getByText(/11:00 pm – 9:00 am/i)

    expect(time).toHaveClass('whitespace-nowrap')
    expect(time).toHaveTextContent(/^11:00 pm – 9:00 am\+1 day$/i)
  })

  it('gives each shift row a neutral background with its own accent stripe', () => {
    renderGrid([definition({ id: 1, name: 'Morning' }), definition({ id: 2, name: 'Evening', sortOrder: 2 })])
    const morning = screen.getByRole('rowheader', { name: /Morning/ })
    const evening = screen.getByRole('rowheader', { name: /Evening/ })

    expect(morning).toHaveClass('ui-plan-shift-cell', 'ui-plan-accent--1')
    expect(evening).toHaveClass('ui-plan-shift-cell', 'ui-plan-accent--2')
    expect(morning.closest('tr')?.className).not.toMatch(/bg-/)
    expect(screen.queryByText('+1 day')).not.toBeInTheDocument()
  })
})
