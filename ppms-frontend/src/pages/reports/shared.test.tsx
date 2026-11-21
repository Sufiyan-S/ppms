import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateRangeInputs, ErrorBox, PrintHeader, SummaryCard } from './shared'

describe('reports shared components', () => {
  it('shows the print period only when a date is given', () => {
    const { rerender } = render(<PrintHeader title="Shifts" />)
    expect(screen.queryByText(/Period:/)).not.toBeInTheDocument()
    rerender(<PrintHeader title="Shifts" from="2026-03-01" />)
    expect(screen.getByText('Period: 2026-03-01 to —')).toBeInTheDocument()
  })

  it('reports date changes from labelled inputs', async () => {
    const onFromChange = vi.fn()
    render(<DateRangeInputs from="" to="2026-03-02" onFromChange={onFromChange} onToChange={vi.fn()} />)
    expect(screen.getByLabelText('To')).toHaveValue('2026-03-02')
    await userEvent.type(screen.getByLabelText('From'), '2026-03-01')
    expect(onFromChange).toHaveBeenLastCalledWith('2026-03-01')
  })

  it('renders a summary card and an error box', () => {
    render(<><SummaryCard label="Total" value="₹10.00" color="text-green-600" /><ErrorBox message="Failed" /></>)
    expect(screen.getByText('₹10.00')).toHaveClass('text-green-600')
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})
