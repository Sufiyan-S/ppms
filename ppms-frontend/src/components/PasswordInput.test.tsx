import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { PasswordInput } from './PasswordInput'

describe('PasswordInput', () => {
  it('hides the password until the toggle is pressed, then hides it again', async () => {
    const user = userEvent.setup()
    render(<PasswordInput aria-label="Password" defaultValue="secret" />)
    const input = screen.getByLabelText('Password')
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(input).toHaveAttribute('type', 'password')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'text')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(toggle)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('forwards its ref and keeps the given class', () => {
    const ref = createRef<HTMLInputElement>()
    render(<PasswordInput ref={ref} aria-label="Password" className="w-full" />)
    expect(ref.current).toBe(screen.getByLabelText('Password'))
    expect(ref.current).toHaveClass('pr-10', 'w-full')
  })

  it('does not submit the surrounding form when toggled', async () => {
    let submitted = false
    render(<form onSubmit={(e) => { e.preventDefault(); submitted = true }}><PasswordInput aria-label="Password" /></form>)
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(submitted).toBe(false)
  })

  it('names the toggle for what the field holds', () => {
    render(<PasswordInput toggleLabel="Show PIN" />)
    expect(screen.getByRole('button', { name: 'Show PIN' })).toBeInTheDocument()
  })
})
