import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Shift } from '../../../types/shift'
import { ShiftStatusRow } from './ShiftStatusRow'

describe('ShiftStatusRow', () => {
  it('names the fuels in words instead of their codes', () => {
    const shift = {
      id: 1,
      duNumber: 2,
      operatorName: 'Ravi',
      shiftWindow: 'MORNING',
      status: 'OPEN',
      actualStartTime: new Date().toISOString(),
      nozzles: [{ fuelType: 'SPEED_PETROL' }, { fuelType: 'DIESEL' }],
    } as unknown as Shift

    render(<ShiftStatusRow shift={shift} />)

    expect(screen.getByText('Speed Petrol · Diesel')).toBeInTheDocument()
    expect(screen.queryByText(/SPEED_PETROL/)).not.toBeInTheDocument()
  })
})
