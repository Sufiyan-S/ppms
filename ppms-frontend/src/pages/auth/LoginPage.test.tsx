import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../../api/authApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { NO_CONNECTION_MESSAGE } from '../../utils/apiError'
import LoginPage from './LoginPage'
import { changeAppLanguage } from '../../i18n'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/languages'
import { useAuthStore } from '../../store/authStore'

vi.mock('../../api/authApi', () => ({ authApi: { login: vi.fn() } }))

describe('LoginPage', () => {
  it('says the connection is down and lets the user try again', async () => {
    const user = userEvent.setup()
    vi.mocked(authApi.login).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))
    renderWithProviders(<LoginPage />)

    await user.type(screen.getByLabelText('Phone number'), '9999999999')
    await user.type(screen.getByLabelText('Password'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(NO_CONNECTION_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  describe('language', () => {
    afterEach(async () => {
      useAuthStore.setState({ user: null, isAuthenticated: false })
      await changeAppLanguage('en')
    })

    it('lets someone pick Hindi before signing in and remembers it on this device', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LoginPage />)

      await user.selectOptions(screen.getByLabelText('Language'), 'hi')

      expect(await screen.findByRole('button', { name: 'साइन इन करें' })).toBeInTheDocument()
      expect(screen.getByLabelText('फ़ोन नंबर')).toBeInTheDocument()
      expect(document.documentElement.lang).toBe('hi')
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('hi')
    })

    it('keeps the signed-in user\'s saved language', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.login).mockResolvedValue({
        userId: 3, fullName: 'Sunita', phoneNumber: '9999999999', role: 'OPERATOR', assignedPumpId: 1,
        mustChangePassword: false, preferredLanguage: 'mr',
      })
      renderWithProviders(<LoginPage />)

      await user.type(screen.getByLabelText('Phone number'), '9999999999')
      await user.type(screen.getByLabelText('Password'), 'secret')
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      await vi.waitFor(() => expect(useAuthStore.getState().user?.preferredLanguage).toBe('mr'))
    })
  })
})
