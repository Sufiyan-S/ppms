import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NumericInput } from './NumericInput'

describe('NumericInput', () => {
  it('opens the decimal keypad with a Next key', () => {
    render(<NumericInput aria-label="Cash" />)
    const input = screen.getByRole('spinbutton', { name: 'Cash' })
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).toHaveAttribute('enterkeyhint', 'next')
  })

  it('moves to the next field on Enter instead of submitting the form', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const user = userEvent.setup()
    render(
      <form onSubmit={onSubmit}>
        <NumericInput aria-label="Cash" />
        <input type="checkbox" aria-label="Verified" />
        <NumericInput aria-label="UPI" disabled />
        <NumericInput aria-label="Card" />
        <button type="submit">Save</button>
      </form>,
    )

    await user.type(screen.getByLabelText('Cash'), '500{Enter}')
    expect(screen.getByLabelText('Card')).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('shows the unit beside the value without changing the field name', () => {
    render(<NumericInput aria-label="Petrol end reading" unit="L" />)
    expect(screen.getByRole('spinbutton', { name: 'Petrol end reading' })).toBeInTheDocument()
    expect(screen.getByText('L')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps room for the unit inside the field, sized to the unit', () => {
    render(<NumericInput aria-label="CNG end reading" unit="kg" />)
    const input = screen.getByRole('spinbutton', { name: 'CNG end reading' })
    const field = input.parentElement as HTMLElement
    expect(field).toHaveClass('ui-numeric-field')
    expect(field.style.getPropertyValue('--ui-numeric-unit-chars')).toBe('2')
    expect(input.nextElementSibling).toHaveClass('ui-numeric-field__unit')
    expect(input.nextElementSibling).toHaveTextContent('kg')
  })

  it('has no placeholder unless one is given', () => {
    render(<NumericInput aria-label="Cash" />)
    expect(screen.getByRole('spinbutton', { name: 'Cash' })).not.toHaveAttribute('placeholder')
  })

  // jsdom loads no CSS; the ui-numeric-input class is what hides the spinner arrows in index.css.
  it('gives every field the spinner-free number style, with or without a unit', () => {
    render(
      <>
        <NumericInput aria-label="Cash" className="text-sm" />
        <NumericInput aria-label="Petrol end reading" unit="L" />
      </>,
    )
    expect(screen.getByRole('spinbutton', { name: 'Cash' })).toHaveClass('ui-numeric-input', 'text-sm')
    expect(screen.getByRole('spinbutton', { name: 'Petrol end reading' })).toHaveClass('ui-numeric-input')
  })
})
