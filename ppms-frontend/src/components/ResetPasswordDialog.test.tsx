import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import { ResetPasswordDialog } from './ResetPasswordDialog'

const resetPassword = vi.hoisted(() => vi.fn())
vi.mock('../api/userApi', () => ({ userApi: { resetPassword } }))

async function submitPasswords(temporary: string, confirm: string) {
  renderWithProviders(<ResetPasswordDialog userId={7} userName="Ravi" onClose={vi.fn()} />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Temporary password'), temporary)
  await user.type(screen.getByLabelText('Confirm temporary password'), confirm)
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
}

describe('ResetPasswordDialog', () => {
  beforeEach(() => { resetPassword.mockClear() })

  it('refuses a temporary password that breaks the password policy without calling the server', async () => {
    await submitPasswords('simple', 'simple')

    expect(await screen.findByRole('alert')).toHaveTextContent("This password doesn't meet the rule above.")
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('keeps Reset password disabled while the passwords differ and says why', async () => {
    await submitPasswords('Temp@4321', 'Temp@4322')

    expect(await screen.findByRole('alert')).toHaveTextContent("Passwords don't match.")
    const reset = screen.getByRole('button', { name: 'Reset password' })
    expect(reset).toBeDisabled()
    expect(reset).toHaveAccessibleDescription(/Still needed\s*Passwords match/)
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('lists both fields as still needed before anything is typed', () => {
    renderWithProviders(<ResetPasswordDialog userId={7} userName="Ravi" onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Reset password' }))
      .toHaveAccessibleDescription(/Temporary password\s*Confirm temporary password/)
  })

  it('resets the password and tells the resetter the user must change it at next sign-in', async () => {
    resetPassword.mockResolvedValue(undefined)

    await submitPasswords('Temp@4321', 'Temp@4321')

    expect(resetPassword).toHaveBeenCalledWith(7, 'Temp@4321')
    expect(await screen.findByRole('status')).toHaveTextContent(/must choose a new password/)
  })

  it('shows the server refusal', async () => {
    resetPassword.mockImplementation(async () => {
      throw { isAxiosError: true, response: { status: 403, data: { message: 'You do not have permission to perform this action' } } }
    })

    await submitPasswords('Temp@4321', 'Temp@4321')

    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission to perform this action')
  })
})
