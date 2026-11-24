import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ShiftDefinition } from '../../../api/shiftDefinitionApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { PlanningGrid } from './PlanningGrid'
import { PlanningLegend } from './PlanningStatusMark'
import type { ShiftPlanning } from './useShiftPlanning'

function definition(overrides: Partial<ShiftDefinition>): ShiftDefinition {
  return {
    id: 1, pumpId: 3, name: 'Morning', startTime: '06:00:00', endTime: '14:00:00', crossesMidnight: false,
    isNightShift: false, sortOrder: 1, effectiveFrom: '2026-01-01', effectiveTo: null, windowLabel: '',
    ...overrides,
  }
}

function renderGrid(sortedDefs: ShiftDefinition[], overrides: Partial<Record<keyof ShiftPlanning, unknown>> = {}) {
  const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']
  const form = {
    isOwnerOrAdmin: true, setEditSlot: vi.fn(), slotError: null, setSlotError: vi.fn(), addOpId: '', setAddOpId: vi.fn(),
    operatorStaff: [], staffById: {}, plan: null, planLoading: false, sortedDefs,
    removeEntryMutation: { mutate: vi.fn(), isPending: false }, addEntryMutation: { mutate: vi.fn(), isPending: false },
    days, today: '2026-11-23', entryMap: {}, actualMap: {}, isEditingSlot: () => false,
    ...overrides,
  } as unknown as ShiftPlanning
  return { form, ...renderWithProviders(<PlanningGrid form={form} />) }
}

const STAFF = { 5: { id: 5, fullName: 'Asha' }, 6: { id: 6, fullName: 'Bilal' }, 7: { id: 7, fullName: 'Chetan' } }

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

  it('names each status in text for screen readers instead of only by icon and colour', () => {
    renderGrid([definition({})], {
      staffById: STAFF, plan: { id: 1 }, today: '2026-11-24',
      entryMap: {
        '2026-11-23': { 1: [{ id: 30, operatorUserId: 6, status: 'PLANNED' }] },
        '2026-11-25': { 1: [{ id: 31, operatorUserId: 5, status: 'PLANNED' }, { id: 32, operatorUserId: 7, status: 'CONFIRMED' }] },
      },
      actualMap: { '2026-11-23': { 1: [5] } },
    })
    const cells = within(screen.getByRole('row', { name: /Morning/ })).getAllByRole('cell')

    expect(cells[0]).toHaveTextContent('AshaConfirmed (showed up)')
    expect(cells[0]).toHaveTextContent("BilalAbsent (didn't show)")
    expect(within(cells[0]).getByText('Confirmed (showed up)')).toHaveClass('sr-only')
    expect(cells[2]).toHaveTextContent('AshaPlanned')
    expect(cells[2]).toHaveTextContent('ChetanConfirmed (showed up)')
  })

  it('keeps the remove button in the layout for touch and keyboard users and removes the entry', async () => {
    const user = userEvent.setup()
    const { form } = renderGrid([definition({})], {
      staffById: STAFF, plan: { id: 1 },
      entryMap: { '2026-11-25': { 1: [{ id: 31, operatorUserId: 5, status: 'PLANNED' }, { id: 32, operatorUserId: 7, status: 'CONFIRMED' }] } },
    })

    const remove = screen.getByRole('button', { name: 'Remove from plan' })
    // jsdom loads no CSS; ui-plan-entry__remove is what index.css shows on touch screens and on keyboard focus.
    expect(remove).toHaveClass('ui-btn-icon', 'ui-plan-entry__remove')
    expect(remove).not.toHaveClass('opacity-0')
    expect(remove.closest('.ui-plan-entry')).not.toBeNull()

    await user.click(remove)
    expect(form.removeEntryMutation.mutate).toHaveBeenCalledWith({ entryId: 31 })
  })

  it('shows the no-plan hint as plain text, not styled like a link', () => {
    renderGrid([definition({})])
    const hint = screen.getByText(/No plan generated for this week yet/)
    expect(hint).toHaveTextContent('No plan generated for this week yet. Click "Auto-generate" to create a schedule.')
    expect(hint.querySelector('.text-primary')).toBeNull()
  })

  it('offers a compact Add button on each coming slot that opens the operator picker', async () => {
    const user = userEvent.setup()
    const { form } = renderGrid([definition({})], { staffById: STAFF, plan: { id: 1 } })

    const addButtons = screen.getAllByRole('button', { name: 'Add operator' })
    expect(addButtons).toHaveLength(7)
    expect(addButtons[0]).toHaveClass('ui-btn', 'ui-btn-compact')
    expect(addButtons[0]).toHaveTextContent('Add')

    await user.click(addButtons[2])
    expect(form.setEditSlot).toHaveBeenCalledWith({ date: '2026-11-25', shiftDefinitionId: 1 })
  })
})

describe('PlanningLegend', () => {
  it('explains each status icon used in the grid in words', () => {
    renderWithProviders(<PlanningLegend />)
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Planned', 'Confirmed (showed up)', "Absent (didn't show)"])
  })
})
