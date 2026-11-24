import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Shift } from '../../../types/shift'
import { ShiftRow } from './ShiftRow'

const shift = {
  id: 11, pumpId: 3, duId: 5, duNumber: 1, duName: 'DU 1',
  nozzles: [{ id: 21, nozzleNumber: 1, fuelType: 'PETROL' }],
  operatorId: 9, operatorName: 'Ravi', shiftWindow: 'MORNING', actualStartTime: '2026-03-15T00:30:00Z',
  fuelReadings: [{ fuelType: 'PETROL', priceSnapshot: 100 }], status: 'OPEN',
} as unknown as Shift

function renderRow(row: Shift, onHandOver?: () => void) {
  render(<table><tbody><ShiftRow shift={row} onClose={vi.fn()} onHandOver={onHandOver} onAddCredit={vi.fn()} /></tbody></table>)
}

describe('ShiftRow', () => {
  it('offers a handover on an open shift when the user may close shifts', () => {
    renderRow(shift, vi.fn())
    expect(screen.getByRole('button', { name: 'Hand over' })).toBeInTheDocument()
  })

  it('offers no handover to a user who may not close shifts', () => {
    renderRow(shift)
    expect(screen.queryByRole('button', { name: 'Hand over' })).not.toBeInTheDocument()
  })

  it('shows window, start time and prices on a second line for phones, where those columns are hidden', () => {
    renderRow(shift)
    expect(screen.getByText(/^MORNING · Started .+ · Petrol ₹100\.00$/)).toHaveClass('md:hidden')
  })

  it('names each fuel in full and shows its price with two decimals', () => {
    renderRow({ ...shift, fuelReadings: [{ fuelType: 'PETROL', priceSnapshot: 102.5 }, { fuelType: 'SPEED_PETROL', priceSnapshot: 110 }] } as unknown as Shift)
    expect(screen.getByText('Petrol ₹102.50 · Speed Petrol ₹110.00')).toBeInTheDocument()
  })

  it('offers no handover once the shift is overdue', () => {
    renderRow({ ...shift, status: 'OPEN_OVERDUE' }, vi.fn())
    expect(screen.queryByRole('button', { name: 'Hand over' })).not.toBeInTheDocument()
  })
})
