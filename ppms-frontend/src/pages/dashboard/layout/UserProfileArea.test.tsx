import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { userApi } from '../../../api/userApi'
import type { StaffMember } from '../../../api/userApi'
import { changeAppLanguage } from '../../../i18n'
import { useLanguageFollowsUser } from '../../../i18n/useLanguageFollowsUser'
import { useAuthStore } from '../../../store/authStore'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { UserProfileArea } from './UserProfileArea'

vi.mock('../../../api/userApi', () => ({ userApi: { updateMyLanguage: vi.fn(), updateMyProfile: vi.fn() } }))
vi.mock('../../../api/authApi', () => ({ authApi: { logout: vi.fn() } }))

function ProfileWithLanguage() {
  useLanguageFollowsUser()
  return <UserProfileArea />
}

describe('UserProfileArea language switch', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 7, fullName: 'Ramesh Patil', role: 'OPERATOR', assignedPumpId: 1, preferredLanguage: 'en' },
    })
  })

  afterEach(async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false })
    await changeAppLanguage('en')
  })

  it('switches the screen to Marathi at once and saves the choice for this user', async () => {
    const user = userEvent.setup()
    vi.mocked(userApi.updateMyLanguage).mockResolvedValue({ preferredLanguage: 'mr' } as StaffMember)
    renderWithProviders(<ProfileWithLanguage />)

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))
    await user.selectOptions(screen.getByLabelText('Language'), 'mr')

    expect(userApi.updateMyLanguage).toHaveBeenCalledWith('mr')
    await waitFor(() => expect(document.documentElement.lang).toBe('mr'))
    expect(await screen.findByRole('button', { name: 'लॉग आउट' })).toBeInTheDocument()
    expect(screen.getByText('भाषांतराची तपासणी सुरू आहे')).toBeInTheDocument()
    expect(useAuthStore.getState().user?.preferredLanguage).toBe('mr')
  })

  it('lists each language by its own name', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ProfileWithLanguage />)

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))

    expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute('lang', 'en')
    expect(screen.getByRole('option', { name: 'हिन्दी' })).toHaveAttribute('lang', 'hi')
    expect(screen.getByRole('option', { name: 'मराठी' })).toHaveAttribute('lang', 'mr')
    expect(screen.queryByText('Translation in review')).not.toBeInTheDocument()
  })

  it('goes back to the previous language when the server cannot save the choice', async () => {
    const user = userEvent.setup()
    vi.mocked(userApi.updateMyLanguage).mockRejectedValue(new AxiosError('Server error', 'ERR', undefined, undefined, {
      status: 500, statusText: '', data: {}, headers: {}, config: { headers: new AxiosHeaders() },
    }))
    renderWithProviders(<ProfileWithLanguage />)

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))
    await user.selectOptions(screen.getByLabelText('Language'), 'hi')

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement.lang).toBe('en'))
    expect(useAuthStore.getState().user?.preferredLanguage).toBe('en')
  })
})

describe('UserProfileArea menu', () => {
  beforeEach(() => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { userId: 7, fullName: 'Ramesh Patil', role: 'OWNER', assignedPumpId: null, preferredLanguage: 'en' },
    })
  })

  afterEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false })
    delete document.documentElement.dataset.density
  })

  it('shows who is signed in, with the name editable, inside the menu', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UserProfileArea />)

    expect(screen.queryByText('Owner')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))

    expect(screen.getByRole('button', { name: 'Edit your name, Ramesh Patil' })).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
  })

  it('switches this device to compact density and back', async () => {
    const user = userEvent.setup()
    renderWithProviders(<UserProfileArea />)
    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))

    const density = screen.getByRole('group', { name: 'Density' })
    expect(within(density).getByRole('radio', { name: 'Comfortable' })).toBeChecked()

    await user.click(within(density).getByRole('radio', { name: 'Compact' }))

    expect(document.documentElement).toHaveAttribute('data-density', 'compact')
    expect(localStorage.getItem('ppms_density')).toBe('compact')

    await user.click(within(density).getByRole('radio', { name: 'Comfortable' }))
    expect(document.documentElement).toHaveAttribute('data-density', 'comfortable')
  })
})
