import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shiftApi } from '../../../api/shiftApi'
import { renderWithProviders } from '../../../test/renderWithProviders'
import type { Shift } from '../../../types/shift'
import { AllShiftsHistory } from './AllShiftsHistory'

vi.mock('../../../api/shiftApi', () => ({ shiftApi: { getShiftHistoryPage: vi.fn(), getShiftHistory: vi.fn() } }))
vi.mock('./HistoryRow', () => ({ HistoryRow: ({ shift }: { shift: Shift }) => <tr><td>Shift {shift.id}</td></tr> }))

function page(ids: number[], number: number) {
  return { content: ids.map(id => ({ id }) as Shift), page: { size: 10, number, totalElements: 23, totalPages: 3 } }
}

describe('AllShiftsHistory', () => {
  beforeEach(() => {
    vi.mocked(shiftApi.getShiftHistoryPage).mockImplementation((_pumpId, _filter, pageNumber) =>
      Promise.resolve(page([pageNumber * 10 + 1], pageNumber)))
  })

  it('asks the server for one page at a time instead of the whole history', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AllShiftsHistory pumpId={5} />)

    expect(await screen.findByText('Shift 1')).toBeInTheDocument()
    expect(shiftApi.getShiftHistoryPage).toHaveBeenCalledWith(5, expect.objectContaining({ from: expect.any(String) }), 0, 10)
    expect(shiftApi.getShiftHistory).not.toHaveBeenCalled()
    expect(screen.getByText(/23 shifts/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Shift 11')).toBeInTheDocument()
    await waitFor(() => expect(shiftApi.getShiftHistoryPage).toHaveBeenLastCalledWith(5, expect.anything(), 1, 10))
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument()
  })
})
