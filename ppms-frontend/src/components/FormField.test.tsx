import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormField } from './FormField'

describe('FormField', () => {
  it('links the label to the control', () => {
    render(<FormField label="Tank name"><input /></FormField>)
    expect(screen.getByLabelText('Tank name')).toBeInstanceOf(HTMLInputElement)
  })

  it('keeps an id the control already has', () => {
    render(<FormField label="Capacity"><input id="capacity" /></FormField>)
    expect(screen.getByLabelText('Capacity')).toHaveAttribute('id', 'capacity')
  })

  it('shows an error as an alert, marks the control invalid and describes it', () => {
    render(<FormField label="Amount" error="Enter an amount" help="In rupees"><input /></FormField>)
    const input = screen.getByLabelText('Amount')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('In rupees Enter an amount')
  })

  it('keeps the control valid and without an alert when there is no error', () => {
    render(<FormField label="Amount"><input aria-describedby="outside" /></FormField>)
    const input = screen.getByLabelText('Amount')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAttribute('aria-describedby', 'outside')
  })
})
