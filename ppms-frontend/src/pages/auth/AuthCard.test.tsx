import { screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../test/renderWithProviders'
import CreditBalancePortalPage from '../portal/CreditBalancePortalPage'
import ForgotPasswordPage from './ForgotPasswordPage'
import ResetPasswordPage from './ResetPasswordPage'

const signedOutScreens: [string, ReactElement, string][] = [
  ['forgot password', <ForgotPasswordPage />, 'Forgot password'],
  ['reset password without a link', <ResetPasswordPage />, 'Invalid reset link'],
  ['credit balance portal', <CreditBalancePortalPage />, 'Credit balance portal'],
]

describe('signed-out screens', () => {
  it.each(signedOutScreens)('%s has one page title, a main region and the language picker', (_, ui, title) => {
    renderWithProviders(ui)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByLabelText('Language')).toBeInTheDocument()
  })

  it('gives credit customers their own brand line instead of the pump-staff one', () => {
    renderWithProviders(<CreditBalancePortalPage />)

    expect(screen.getByText('Your fuel credit, at a glance.')).toBeInTheDocument()
    expect(screen.queryByText('Run every pump shift with clarity.')).not.toBeInTheDocument()
  })

  it('shows the pump-staff brand line on the staff screens', () => {
    renderWithProviders(<ForgotPasswordPage />)

    expect(screen.getByText('Run every pump shift with clarity.')).toBeInTheDocument()
  })
})
