import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../../api/authApi'
import { userApi } from '../../api/userApi'
import { renderWithProviders } from '../../test/renderWithProviders'
import { NO_CONNECTION_MESSAGE } from '../../utils/apiError'
import LoginPage from './LoginPage'
import { changeAppLanguage } from '../../i18n'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/languages'
import { useAuthStore } from '../../store/authStore'
import type { LoginResponse } from '../../types/auth'

vi.mock('../../api/authApi', () => ({ authApi: { login: vi.fn() } }))
vi.mock('../../api/userApi', () => ({ userApi: { updateMyLanguage: vi.fn() } }))

const REMEMBERED_PHONE_KEY = 'ppms_remembered_phone'
const PASSWORD = 'Pa55word!x'

function signedInAs(preferredLanguage: string): LoginResponse {
  return {
    userId: 3, fullName: 'Sunita', phoneNumber: '9876543210', role: 'OPERATOR', assignedPumpId: 1,
    mustChangePassword: false, preferredLanguage,
  }
}

async function signIn(user: ReturnType<typeof userEvent.setup>, labels = { phone: 'Phone number', password: 'Password', button: 'Sign in' }) {
  await user.type(screen.getByLabelText(labels.phone), '9876543210')
  await user.type(screen.getByLabelText(labels.password), PASSWORD)
  await user.click(screen.getByRole('button', { name: labels.button }))
}

function storedValues(): string[] {
  return Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? '')
}

function useFinePointer(fine: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: fine)' && fine, media: query }))
}

describe('LoginPage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  afterEach(async () => {
    vi.unstubAllGlobals()
    useAuthStore.setState({ user: null, isAuthenticated: false })
    await changeAppLanguage('en')
  })

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

  describe('phone number', () => {
    it('groups the digits 5 + 5 while typing, ticks a full number and sends only the 10 digits', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('en'))
      const { container } = renderWithProviders(<LoginPage />)
      const phone = screen.getByLabelText('Phone number')

      await user.type(phone, '98765')
      expect(phone).toHaveValue('98765')
      expect(container.querySelector('.ui-auth-phone__check')).toBeNull()

      await user.type(phone, '43210')
      expect(phone).toHaveValue('98765 43210')
      expect(container.querySelector('.ui-auth-phone__check')).not.toBeNull()

      await user.type(screen.getByLabelText('Password'), PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      await vi.waitFor(() => expect(authApi.login).toHaveBeenCalledWith({ phoneNumber: '9876543210', password: PASSWORD }))
    })

    it.each(['+91 98765-43210', '098765 43210', '9876543210'])('turns a pasted %s into the 10 digits', async (pasted) => {
      const user = userEvent.setup()
      renderWithProviders(<LoginPage />)
      const phone = screen.getByLabelText('Phone number')

      await user.click(phone)
      await user.paste(pasted)

      expect(phone).toHaveValue('98765 43210')
    })

    it('says the +91 is already there to screen readers', () => {
      renderWithProviders(<LoginPage />)

      expect(screen.getByLabelText('Phone number')).toHaveAccessibleDescription('10-digit mobile number. The +91 country code is already added.')
    })

    it('still refuses a number that is not 10 digits', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LoginPage />)

      await user.type(screen.getByLabelText('Phone number'), '98765')
      await user.type(screen.getByLabelText('Password'), PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      expect(await screen.findByText('Phone number must be exactly 10 digits')).toBeInTheDocument()
      expect(authApi.login).not.toHaveBeenCalled()
    })
  })

  describe('remember my number', () => {
    it('is off by default, puts the cursor in the phone field and stores nothing', async () => {
      const user = userEvent.setup()
      useFinePointer(true)
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('en'))
      renderWithProviders(<LoginPage />)

      expect(screen.getByRole('checkbox', { name: 'Remember my number on this device' })).not.toBeChecked()
      await vi.waitFor(() => expect(screen.getByLabelText('Phone number')).toHaveFocus())
      await signIn(user)

      await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
      expect(localStorage.getItem(REMEMBERED_PHONE_KEY)).toBeNull()
    })

    it('stores only the number when ticked, never the password', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('en'))
      renderWithProviders(<LoginPage />)

      await user.click(screen.getByRole('checkbox', { name: 'Remember my number on this device' }))
      await signIn(user)

      await vi.waitFor(() => expect(localStorage.getItem(REMEMBERED_PHONE_KEY)).toBe('9876543210'))
      expect(storedValues().some((value) => value.includes(PASSWORD))).toBe(false)
    })

    it('fills in the remembered number with the box ticked and puts the cursor in the password', async () => {
      useFinePointer(true)
      localStorage.setItem(REMEMBERED_PHONE_KEY, '9876543210')
      renderWithProviders(<LoginPage />)

      expect(screen.getByLabelText('Phone number')).toHaveValue('98765 43210')
      expect(screen.getByRole('checkbox', { name: 'Remember my number on this device' })).toBeChecked()
      await vi.waitFor(() => expect(screen.getByLabelText('Password')).toHaveFocus())
    })

    it.each([
      ['a touch screen', () => useFinePointer(false)],
      ['a browser without matchMedia', () => {}],
    ])('leaves the fields unfocused on %s, so no keyboard pops up', async (_, setPointer) => {
      setPointer()
      localStorage.setItem(REMEMBERED_PHONE_KEY, '9876543210')
      renderWithProviders(<LoginPage />)

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(screen.getByLabelText('Password')).not.toHaveFocus()
      expect(screen.getByLabelText('Phone number')).not.toHaveFocus()
    })

    it('forgets the number when unticked and the sign-in succeeds', async () => {
      const user = userEvent.setup()
      localStorage.setItem(REMEMBERED_PHONE_KEY, '9876543210')
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('en'))
      renderWithProviders(<LoginPage />)

      await user.click(screen.getByRole('checkbox', { name: 'Remember my number on this device' }))
      await user.type(screen.getByLabelText('Password'), PASSWORD)
      await user.click(screen.getByRole('button', { name: 'Sign in' }))

      await vi.waitFor(() => expect(localStorage.getItem(REMEMBERED_PHONE_KEY)).toBeNull())
    })

    it('survives signing out', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('en'))
      renderWithProviders(<LoginPage />)

      await user.click(screen.getByRole('checkbox', { name: 'Remember my number on this device' }))
      await signIn(user)
      await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
      useAuthStore.getState().clearAuth()

      expect(localStorage.getItem(REMEMBERED_PHONE_KEY)).toBe('9876543210')
    })
  })

  it('warns while Caps Lock is on and stops when it is off', () => {
    const { container } = renderWithProviders(<LoginPage />)
    const password = screen.getByLabelText('Password')
    const warning = container.querySelector('.ui-auth-caps')

    expect(warning).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument()

    fireEvent.keyDown(password, { key: 'A', modifierCapsLock: true })
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument()

    fireEvent.keyUp(password, { key: 'CapsLock', modifierCapsLock: false })
    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument()
  })

  it('shows it is signing in and locks the form until the server answers', async () => {
    const user = userEvent.setup()
    let answer: (response: LoginResponse) => void = () => {}
    vi.mocked(authApi.login).mockReturnValue(new Promise((resolve) => { answer = resolve }))
    renderWithProviders(<LoginPage />)

    await signIn(user)

    const button = await screen.findByRole('button', { name: 'Signing in…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Password')).toHaveAttribute('readonly')
    expect(screen.getByRole('checkbox', { name: 'Remember my number on this device' })).toBeDisabled()

    answer(signedInAs('en'))
    await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
  })

  describe('language', () => {
    const hindiLabels = { phone: 'फ़ोन नंबर', password: 'पासवर्ड', button: 'साइन इन करें' }

    it('lets someone pick Hindi before signing in and remembers it on this device', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LoginPage />)

      await user.click(screen.getByRole('radio', { name: 'हिन्दी' }))

      expect(await screen.findByRole('button', { name: 'साइन इन करें' })).toBeInTheDocument()
      expect(screen.getByLabelText('फ़ोन नंबर')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'हिन्दी' })).toBeChecked()
      expect(document.documentElement.lang).toBe('hi')
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('hi')
    })

    it('names each language in its own script, marked with its language', () => {
      renderWithProviders(<LoginPage />)

      expect(screen.getByText('English')).toHaveAttribute('lang', 'en')
      expect(screen.getByText('हिन्दी')).toHaveAttribute('lang', 'hi')
      expect(screen.getByText('मराठी')).toHaveAttribute('lang', 'mr')
    })

    it('keeps the signed-in user\'s saved language when none was picked here', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('mr'))
      renderWithProviders(<LoginPage />)

      await signIn(user)

      await vi.waitFor(() => expect(useAuthStore.getState().user?.preferredLanguage).toBe('mr'))
      expect(userApi.updateMyLanguage).not.toHaveBeenCalled()
    })

    it('saves a language picked here to the profile after signing in', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('en'))
      vi.mocked(userApi.updateMyLanguage).mockResolvedValue({} as Awaited<ReturnType<typeof userApi.updateMyLanguage>>)
      renderWithProviders(<LoginPage />)

      await user.click(screen.getByRole('radio', { name: 'हिन्दी' }))
      await screen.findByRole('button', { name: hindiLabels.button })
      expect(userApi.updateMyLanguage).not.toHaveBeenCalled()
      await signIn(user, hindiLabels)

      await vi.waitFor(() => expect(userApi.updateMyLanguage).toHaveBeenCalledWith('hi'))
      expect(useAuthStore.getState().user?.preferredLanguage).toBe('hi')
    })

    it('does not save a picked language the profile already has', async () => {
      const user = userEvent.setup()
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('hi'))
      renderWithProviders(<LoginPage />)

      await user.click(screen.getByRole('radio', { name: 'हिन्दी' }))
      await screen.findByRole('button', { name: hindiLabels.button })
      await signIn(user, hindiLabels)

      await vi.waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true))
      expect(userApi.updateMyLanguage).not.toHaveBeenCalled()
    })

    it('still signs in when saving the picked language fails', async () => {
      const user = userEvent.setup()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.mocked(authApi.login).mockResolvedValue(signedInAs('en'))
      vi.mocked(userApi.updateMyLanguage).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))
      renderWithProviders(<LoginPage />)

      await user.click(screen.getByRole('radio', { name: 'मराठी' }))
      await screen.findByRole('button', { name: 'साइन इन करा' })
      await signIn(user, { phone: 'फोन नंबर', password: 'पासवर्ड', button: 'साइन इन करा' })

      await vi.waitFor(() => expect(warn).toHaveBeenCalled())
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      warn.mockRestore()
    })
  })
})
