import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { authApi } from '../../api/authApi'
import ProtectedRoute from '../../components/ProtectedRoute'
import { useAuthStore } from '../../store/authStore'
import ChangePasswordRequiredPage from './ChangePasswordRequiredPage'

vi.mock('../../api/authApi', () => ({
  authApi: { logout: vi.fn().mockResolvedValue(undefined), changePassword: vi.fn() },
}))

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<p>Login screen</p>} />
          <Route path="/change-password" element={<ChangePasswordRequiredPage />} />
          <Route path="/dashboard/shifts" element={<ProtectedRoute page="shifts"><p>Shifts screen</p></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function signIn(mustChangePassword: boolean) {
  useAuthStore.setState({
    user: { userId: 3, fullName: 'Asha', role: 'OPERATOR', assignedPumpId: 4, mustChangePassword },
    isAuthenticated: true,
  })
}

describe('forced password change', () => {
  beforeEach(() => vi.mocked(authApi.changePassword).mockReset())

  it('sends a user with a password set by someone else to the change-password screen', async () => {
    signIn(true)
    renderAt('/dashboard/shifts')

    expect(await screen.findByText('Choose a new password')).toBeInTheDocument()
    expect(screen.queryByText('Shifts screen')).not.toBeInTheDocument()
  })

  it('lets a user who already chose their password into the app', () => {
    signIn(false)
    renderAt('/dashboard/shifts')

    expect(screen.getByText('Shifts screen')).toBeInTheDocument()
  })

  it('signs out instead of letting the user skip the change', async () => {
    signIn(true)
    renderAt('/change-password')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))

    expect(authApi.logout).toHaveBeenCalled()
    expect(await screen.findByText('Login screen')).toBeInTheDocument()
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('sends the user to sign in again once the new password is saved', async () => {
    vi.mocked(authApi.changePassword).mockResolvedValue({ message: 'Password updated successfully. Please sign in again.' })
    signIn(true)
    renderAt('/change-password')
    const user = userEvent.setup()

    const change = screen.getByRole('button', { name: 'Change password' })
    expect(change).toHaveAccessibleDescription(/Still needed\s*Current password\s*New password\s*Confirm new password/)
    await user.type(screen.getByLabelText('Current password'), 'Temp@4321')
    await user.type(screen.getByLabelText('New password'), 'Fresh@9876')
    await user.type(screen.getByLabelText('Confirm new password'), 'Fresh@9876')
    await user.click(change)

    expect(authApi.changePassword).toHaveBeenCalledWith('Temp@4321', 'Fresh@9876')
    expect(await screen.findByText('Login screen')).toBeInTheDocument()
  })
})
