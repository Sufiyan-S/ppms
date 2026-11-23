import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StaffMember } from '../../api/userApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { GeneratePayrollDialog } from './GeneratePayrollDialog'
import { periodDays } from './payrollFormat'

vi.mock('../../api/payrollApi', () => ({ payrollApi: { generatePayroll: vi.fn(), getPendingDiscrepancies: vi.fn().mockResolvedValue([]) } }))

const staff = [{ id: 9, fullName: 'Ravi Kumar', role: 'OPERATOR' }] as StaffMember[]

describe('GeneratePayrollDialog', () => {
  it('keeps Review disabled and says the staff member is still needed', () => {
    renderWithProviders(<GeneratePayrollDialog pumpId={3} staff={staff} onGenerated={vi.fn()} onClose={vi.fn()} />)

    const review = screen.getByRole('button', { name: 'Review' })
    expect(review).toBeDisabled()
    expect(review).toHaveAccessibleDescription(/Still needed\s*Staff member/)
  })

  it('shows how many days the pay period covers as the dates change', async () => {
    renderWithProviders(<GeneratePayrollDialog pumpId={3} staff={staff} onGenerated={vi.fn()} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Period from'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('Period to'), { target: { value: '2026-03-31' } })

    expect(screen.getByLabelText('Pay period')).toHaveTextContent('31 days')
  })

  it('moves to the review once a staff member is chosen', async () => {
    const user = userEvent.setup()
    renderWithProviders(<GeneratePayrollDialog pumpId={3} staff={staff} onGenerated={vi.fn()} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /Staff member/ }))
    await user.click(await screen.findByRole('option', { name: /Ravi Kumar/ }))
    await user.click(screen.getByRole('button', { name: 'Review' }))

    expect(await screen.findByRole('dialog', { name: 'Review payroll' })).toBeInTheDocument()
  })
})

describe('periodDays', () => {
  it('counts both ends and refuses a period that ends first', () => {
    expect(periodDays('2026-03-01', '2026-03-01')).toBe(1)
    expect(periodDays('2026-02-01', '2026-02-28')).toBe(28)
    expect(periodDays('2026-03-02', '2026-03-01')).toBeNull()
    expect(periodDays('', '2026-03-01')).toBeNull()
  })
})
