import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { payrollApi } from '../../api/payrollApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { ReviewModal } from './ReviewModal'

vi.mock('../../api/payrollApi', () => ({ payrollApi: { getPendingDiscrepancies: vi.fn() } }))

describe('ReviewModal', () => {
  it('lets only a SHORT discrepancy be deducted from salary', async () => {
    vi.mocked(payrollApi.getPendingDiscrepancies).mockResolvedValue([
      { id: 31, shiftDate: '2026-03-14', duNumber: 1, duName: 'DU 1', discrepancyType: 'SHORT', discrepancyAmount: 50, discrepancyReason: null },
      { id: 32, shiftDate: '2026-03-15', duNumber: 1, duName: 'DU 1', discrepancyType: 'OVER', discrepancyAmount: 75, discrepancyReason: null },
    ])
    const onGenerate = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ReviewModal
        form={{ userId: 9, periodFrom: '2026-03-01', periodTo: '2026-03-31', notes: null }}
        selectedStaff={undefined}
        pumpId={3}
        formError={null}
        isPending={false}
        onClose={vi.fn()}
        onGenerate={onGenerate}
      />,
    )

    expect(await screen.findByText('Not deductible')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByLabelText('Deducted from net pay')).toHaveTextContent('—')

    await user.click(screen.getByRole('checkbox', { name: 'Deduct #31 from salary' }))
    expect(screen.getByText('1 deduction selected')).toBeInTheDocument()
    expect(screen.getByLabelText('Deducted from net pay')).toHaveTextContent('−₹50.00')

    await user.click(screen.getByRole('button', { name: 'Generate payroll' }))
    expect(onGenerate).toHaveBeenCalledWith([31])
  })
})
