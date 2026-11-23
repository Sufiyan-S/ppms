import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DashboardColumns, KpiRow } from './DashboardGrid'
import { FilterBar } from './FilterBar'
import { FormGrid, FormGridFullRow } from './FormGrid'
import { Page } from './Page'
import { PageSection } from './PageSection'
import { StickyActions } from './StickyActions'

describe('Page and PageSection', () => {
  it('wraps the page in the shared container', () => {
    render(<Page><p>Content</p></Page>)
    expect(screen.getByText('Content').parentElement).toHaveClass('ui-page-frame')
  })

  it('names the section by its heading and shows actions and a note in its head', () => {
    render(
      <PageSection title="Active Shifts" titleMeta={<span>Updated just now</span>} description="Highway Pump"
        actions={<button type="button">Open Shift</button>}>
        <p>Rows</p>
      </PageSection>,
    )

    const section = screen.getByRole('region', { name: 'Active Shifts' })
    expect(within(section).getByRole('heading', { level: 2, name: 'Active Shifts' })).toBeInTheDocument()
    expect(within(section).getByText('Updated just now')).toBeInTheDocument()
    expect(within(section).getByText('Highway Pump')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Open Shift' })).toBeInTheDocument()
    expect(screen.getByText('Rows').parentElement).toHaveClass('ui-page-section__body')
  })

  it('lets tables reach the card edges and nests under an h2 with an h3', () => {
    render(<PageSection title="Detail" headingLevel={3} flush><p>Table</p></PageSection>)
    expect(screen.getByRole('heading', { level: 3, name: 'Detail' })).toBeInTheDocument()
    expect(screen.getByText('Table').parentElement).toHaveClass('ui-page-section__body--flush')
  })
})

describe('FilterBar', () => {
  it('groups the filters under a name and offers Clear filters only while a filter is set', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const { rerender } = render(
      <FilterBar label="Shift filters" onClearFilters={onClear} hasActiveFilters={false} summary="23 shifts">
        <input aria-label="From date" type="date" />
      </FilterBar>,
    )

    const group = screen.getByRole('group', { name: 'Shift filters' })
    expect(within(group).getByLabelText('From date')).toBeInTheDocument()
    expect(within(group).getByText('23 shifts')).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()

    rerender(
      <FilterBar label="Shift filters" onClearFilters={onClear} hasActiveFilters summary="5 shifts">
        <input aria-label="From date" type="date" />
      </FilterBar>,
    )
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})

describe('FormGrid and StickyActions', () => {
  it('lays short fields in the grid and long ones across both columns', () => {
    render(
      <FormGrid>
        <label>UPI <input /></label>
        <FormGridFullRow><label>Notes <textarea /></label></FormGridFullRow>
      </FormGrid>,
    )

    const grid = screen.getByLabelText('UPI').closest('.ui-form-grid')
    expect(grid).not.toBeNull()
    expect(screen.getByLabelText('Notes').closest('.ui-form-grid__full')?.parentElement).toBe(grid)
  })

  it('keeps the form’s actions in one sticky bar', () => {
    render(<StickyActions><button type="button">Save</button><button type="button">Cancel</button></StickyActions>)
    const bar = screen.getByRole('button', { name: 'Save' }).parentElement
    expect(bar).toHaveClass('ui-sticky-actions')
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Cancel' }))
  })
})

describe('Dashboard grid', () => {
  it('names the KPI row and passes its column count to the layout', () => {
    render(<KpiRow label="Today at a glance" columns={3}><p>Revenue</p></KpiRow>)
    const row = screen.getByRole('region', { name: 'Today at a glance' })
    expect(row).toHaveClass('ui-kpi-row')
    expect(row.style.getPropertyValue('--kpi-columns')).toBe('3')
  })

  it('puts its blocks into the side-by-side columns', () => {
    render(<DashboardColumns><p>Inbox</p><p>Live shifts</p></DashboardColumns>)
    expect(screen.getByText('Inbox').parentElement).toHaveClass('ui-dashboard-columns')
  })
})
