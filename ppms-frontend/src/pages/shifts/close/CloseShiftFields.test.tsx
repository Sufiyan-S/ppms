import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReadingField } from './CloseShiftFields'

describe('ReadingField', () => {
  it('gives the closing meter reading input an accessible name', () => {
    render(
      <ReadingField label="Nozzle #1 Petrol" startValue={1000} soldUnits={0} pricePerUnit={100} value=""
        onChange={vi.fn()} unitLabel="L" />,
    )
    expect(screen.getByRole('spinbutton', { name: 'Nozzle #1 Petrol end reading' })).toBeInTheDocument()
  })
})
