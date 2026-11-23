import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PageHeader } from './PageHeader'
import { PageTabs } from './PageTabs'
import { useActiveTab } from './useActiveTab'

const TABS = [{ id: 'ledger', label: 'Ledger' }, { id: 'clients', label: 'Clients' }]

function TabbedPage() {
  const activeTab = useActiveTab(['ledger', 'clients'], 'ledger')
  const { search } = useLocation()
  return (
    <>
      <PageHeader title="Credit" tabs={<PageTabs label="Credit views" tabs={TABS} activeTab={activeTab} resetParams={['client']} />} />
      <p>Showing {activeTab}</p>
      <output aria-label="Address">{search}</output>
    </>
  )
}

function renderAt(path: string, ui: ReactElement) {
  return render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>)
}

describe('PageHeader', () => {
  it('gives the page one h1 with its description, badges and actions, secondary before primary', () => {
    renderAt('/', (
      <PageHeader
        title="Shifts"
        description="Open and close shifts."
        badges={<span>2 open now</span>}
        secondaryActions={<button type="button">Backfill</button>}
        primaryAction={<button type="button">Open Shift</button>}
      />
    ))

    expect(screen.getByRole('heading', { level: 1, name: 'Shifts' })).toBeInTheDocument()
    expect(screen.getByText('Open and close shifts.')).toBeInTheDocument()
    expect(screen.getByText('2 open now')).toBeInTheDocument()
    const [first, second] = screen.getAllByRole('button')
    expect(first).toHaveTextContent('Backfill')
    expect(second).toHaveTextContent('Open Shift')
  })

  it('shows breadcrumbs with the current page marked, and a back link', () => {
    renderAt('/', (
      <PageHeader
        title="Acme Transport"
        breadcrumbs={[{ label: 'Credit', to: '/dashboard/credit' }, { label: 'Acme Transport' }]}
        backLink={{ to: '/dashboard/credit', label: 'All clients' }}
      />
    ))

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(trail).getByRole('link', { name: 'Credit' })).toHaveAttribute('href', '/dashboard/credit')
    expect(within(trail).getByText('Acme Transport')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'All clients' })).toHaveAttribute('href', '/dashboard/credit')
  })

  it('leaves out the actions area when there are no actions', () => {
    const { container } = renderAt('/', <PageHeader title="Reports" />)
    expect(container.querySelector('.ui-page-head__actions')).toBeNull()
  })
})

describe('PageTabs', () => {
  it('reads the open tab from the address and marks it as the current page', () => {
    renderAt('/credit?tab=clients', <TabbedPage />)

    expect(screen.getByRole('navigation', { name: 'Credit views' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Ledger' })).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Showing clients')).toBeInTheDocument()
  })

  it('falls back to the default tab for a missing or unknown tab', () => {
    renderAt('/credit?tab=nonsense', <TabbedPage />)
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveAttribute('aria-current', 'page')
  })

  it('switches tab through the address, keeping other parameters and dropping the previous view’s ones', async () => {
    const user = userEvent.setup()
    renderAt('/credit?tab=clients&client=12&pump=4', <TabbedPage />)

    await user.click(screen.getByRole('link', { name: 'Ledger' }))

    expect(screen.getByText('Showing ledger')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('?tab=ledger&pump=4')
  })
})
