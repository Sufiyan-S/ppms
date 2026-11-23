import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DocumentTitle } from '../components/DocumentTitle'
import { pageTitleFor } from './pageTitles'

describe('pageTitleFor', () => {
  it('names each page after its menu entry', () => {
    expect(pageTitleFor('/dashboard/credit')).toBe('Credit · PPMS')
    expect(pageTitleFor('/dashboard')).toBe('Overview · PPMS')
    expect(pageTitleFor('/dashboard/balance-sheets')).toBe('Balance Sheets · PPMS')
  })

  it('uses the section name for nested pages and a trailing slash', () => {
    expect(pageTitleFor('/dashboard/credit/12')).toBe('Credit · PPMS')
    expect(pageTitleFor('/dashboard/reports/')).toBe('Reports · PPMS')
  })

  it('names pages outside the menu', () => {
    expect(pageTitleFor('/dashboard/notifications')).toBe('Notifications · PPMS')
    expect(pageTitleFor('/login')).toBe('Sign in · PPMS')
    expect(pageTitleFor('/super-admin')).toBe('Super Admin · PPMS')
  })

  it('falls back to the app name', () => {
    expect(pageTitleFor('/somewhere-else')).toBe('PPMS')
  })
})

describe('DocumentTitle', () => {
  it('sets the browser tab title for the open route', () => {
    render(<MemoryRouter initialEntries={['/dashboard/settlements']}><DocumentTitle /></MemoryRouter>)
    expect(document.title).toBe('Settlements · PPMS')
  })
})
