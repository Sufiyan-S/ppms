import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { authApi } from '../api/authApi'
import { renderWithProviders } from '../test/renderWithProviders'
import { ChangePasswordModal } from './ChangePasswordModal'

vi.mock('../api/authApi', () => ({ authApi: { changePassword: vi.fn() } }))

describe('ChangePasswordModal', () => {
  it('shows a mismatch under the confirmation and keeps Change password disabled', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordModal onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Current password'), 'Temp@4321')
    await user.type(screen.getByLabelText('New password'), 'Fresh@9876')
    await user.type(screen.getByLabelText('Confirm new password'), 'Fresh@9875')

    expect(screen.getByLabelText('Confirm new password')).toHaveAccessibleDescription("Passwords don't match.")
    const change = screen.getByRole('button', { name: 'Change password' })
    expect(change).toBeDisabled()
    expect(change).toHaveAccessibleDescription(/Still needed\s*Passwords match/)
  })

  it('refuses a new password that breaks the rule next to that field, without calling the server', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChangePasswordModal onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Current password'), 'Temp@4321')
    await user.type(screen.getByLabelText('New password'), 'simple')
    await user.type(screen.getByLabelText('Confirm new password'), 'simple')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(/doesn't meet the rule above/)
    expect(authApi.changePassword).not.toHaveBeenCalled()
  })
})
