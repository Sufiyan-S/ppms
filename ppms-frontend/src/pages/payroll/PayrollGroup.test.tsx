import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PayrollRecord, PayrollStatus } from '../../api/payrollApi'
import { PayrollGroup } from './PayrollGroup'

function record(status: PayrollStatus): PayrollRecord {
  return {
    id: 7, pumpId: 1, userId: 3, periodFrom: '2026-11-01', periodTo: '2026-11-30', salaryType: 'DAILY',
    totalShifts: 0, shift1Shifts: 0, shift1Hours: 0, shift1RateSnapshot: null, standardShifts: 0, standardHours: 0, standardRateSnapshot: null,
    totalDays: 30, leaveDays: 0, daysWorked: 30, dailyRateSnapshot: 500,
    grossAmount: 15_000, deductions: 0, netPay: 15_000, notes: null, status, approvedBy: null,
    createdAt: '2026-11-30T00:00:00Z', updatedAt: '2026-11-30T00:00:00Z',
  }
}

function renderGroup(status: PayrollStatus, isOpen = true) {
  const onStatusChange = vi.fn()
  const onDelete = vi.fn()
  render(
    <PayrollGroup
      status={status} records={[record(status)]} totalRecords={1} totalAmount={15_000}
      page={0} pageSize={10} onPageChange={vi.fn()} onPageSizeChange={vi.fn()}
      isOpen={isOpen} onToggle={vi.fn()} staff={[]}
      onStatusChange={onStatusChange} onDelete={onDelete} isPending={false} isDeletePending={false}
    />,
  )
  return { onStatusChange, onDelete }
}

describe('PayrollGroup', () => {
  it('asks before marking an approved record as paid, because paid is final', async () => {
    const user = userEvent.setup()
    const { onStatusChange } = renderGroup('APPROVED')

    await user.click(screen.getByRole('button', { name: 'Mark as paid' }))
    expect(onStatusChange).not.toHaveBeenCalled()
    expect(screen.getByText('Mark as paid? This is final and cannot be undone.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onStatusChange).toHaveBeenCalledWith(7, 'PAID')
  })

  it('asks to mark as paid in neutral ink with a primary Yes, since paying is not destructive', async () => {
    const user = userEvent.setup()
    renderGroup('APPROVED')

    await user.click(screen.getByRole('button', { name: 'Mark as paid' }))

    expect(screen.getByText('Mark as paid? This is final and cannot be undone.')).toHaveClass('text-ink')
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveClass('ui-btn-primary')
  })

  it('reports whether the group is open and points the header at its records', () => {
    renderGroup('DRAFT')
    const header = screen.getByRole('button', { expanded: true })
    expect(document.getElementById(header.getAttribute('aria-controls') ?? '')).toHaveTextContent('Mark as approved')
  })

  it('reports a closed group as collapsed with nothing to point at', () => {
    renderGroup('DRAFT', false)
    const header = screen.getByRole('button', { expanded: false })
    expect(header).not.toHaveAttribute('aria-controls')
  })

  it('approves a draft in one click', async () => {
    const user = userEvent.setup()
    const { onStatusChange } = renderGroup('DRAFT')

    await user.click(screen.getByRole('button', { name: 'Mark as approved' }))
    expect(onStatusChange).toHaveBeenCalledWith(7, 'APPROVED')
  })

  it('calls removing a draft Delete, not Reject, and deletes only after confirmation', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderGroup('DRAFT')
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete this draft? The record is removed for good.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'No' }))
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onDelete).toHaveBeenCalledWith(7)
  })
})
