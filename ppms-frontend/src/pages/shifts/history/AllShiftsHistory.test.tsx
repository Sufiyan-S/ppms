import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../../api/shiftApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { Shift } from '../../../types/shift'
import { AllShiftsHistory } from './AllShiftsHistory'

vi.mock('../../../api/shiftApi', () => ({ shiftApi: { getShiftHistoryPage: vi.fn(), getShiftHistory: vi.fn() } }))
vi.mock('./ShiftDetail', () => ({ ShiftDetail: ({ shiftId }: { shiftId: number }) => <p>Detail of shift {shiftId}</p> }))

function listedShift(id: number): Shift {
  return {
    id, operatorName: `Operator ${id}`, duName: 'DU 1', duNumber: 1, shiftDate: '2026-11-20', shiftWindow: 'Day',
    totalAmountDue: 500, status: 'CLOSED_BALANCED',
  } as Shift
}

function page(ids: number[], number: number) {
  return { content: ids.map(listedShift), page: { size: 10, number, totalElements: 23, totalPages: 3 } }
}

function CurrentSearch() {
  return <output aria-label="Address">{useLocation().search}</output>
}

describe('AllShiftsHistory', () => {
  beforeEach(() => {
    vi.mocked(shiftApi.getShiftHistoryPage).mockImplementation((_pumpId, _filter, pageNumber) =>
      Promise.resolve(page([pageNumber * 10 + 1], pageNumber)))
  })

  it('asks the server for one page at a time instead of the whole history', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AllShiftsHistory pumpId={5} />)

    expect(await screen.findByRole('link', { name: /Shift #1 · Operator 1/ })).toBeInTheDocument()
    expect(shiftApi.getShiftHistoryPage).toHaveBeenCalledWith(5, expect.objectContaining({ from: expect.any(String) }), 0, 10)
    expect(shiftApi.getShiftHistory).not.toHaveBeenCalled()
    expect(screen.getByText(/23 shifts/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next page' }))

    expect(await screen.findByRole('link', { name: /Shift #11/ })).toBeInTheDocument()
    await waitFor(() => expect(shiftApi.getShiftHistoryPage).toHaveBeenLastCalledWith(5, expect.anything(), 1, 10))
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('11–20')).toBeInTheDocument()
  })

  it('keeps the dates in the address and offers to clear them', async () => {
    const user = userEvent.setup()
    renderWithProviders(<><AllShiftsHistory pumpId={5} /><CurrentSearch /></>)

    const fromDate = await screen.findByLabelText('From date')
    expect(screen.getByRole('group', { name: 'Shift filters' })).toContainElement(fromDate)
    expect(fromDate).toHaveClass('min-w-[8.5rem]')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('from=&to=')
    await waitFor(() => expect(shiftApi.getShiftHistoryPage).toHaveBeenLastCalledWith(5, { from: undefined, to: undefined, fuelType: undefined }, 0, 10))
  })

  it('opens a shift by putting its id in the address and marks it as the current item', async () => {
    const user = userEvent.setup()
    renderWithProviders(<><AllShiftsHistory pumpId={5} /><CurrentSearch /></>)

    await user.click(await screen.findByRole('link', { name: /Shift #1 · Operator 1/ }))

    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('history=all&shift=1')
    expect(screen.getByText('Detail of shift 1')).toBeInTheDocument()
    expect(screen.getByRole('link', { hidden: true, name: /Shift #1 · Operator 1/ })).toHaveAttribute('aria-current', 'page')
  })
})
