import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, useSearchParams } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { resetScreenWidthAfterEach, setScreenWidth } from '../../test/screenWidth'
import { ListDetail } from './ListDetail'

function ClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('client')
  return (
    <main>
      <ListDetail
        listLabel="Clients"
        detailLabel="Client details"
        selectedId={selected}
        list={(
          <ul>
            {['Acme', 'Bharat'].map((name) => (
              <li key={name}>
                <Link to={`?client=${name}`} aria-current={selected === name ? 'page' : undefined}>{name}</Link>
              </li>
            ))}
          </ul>
        )}
        detail={<h2>{selected} ledger</h2>}
        placeholder={<p>Choose a client</p>}
        onBack={() => setSearchParams({})}
      />
    </main>
  )
}

function renderAt(path: string) {
  render(<MemoryRouter initialEntries={[path]}><ClientsPage /></MemoryRouter>)
}

describe('ListDetail on desktop', () => {
  resetScreenWidthAfterEach()

  it('shows the list beside a placeholder until an item is chosen', () => {
    setScreenWidth(1280)
    renderAt('/credit')

    expect(screen.getByRole('navigation', { name: 'Clients' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Client details' })).toHaveTextContent('Choose a client')
    expect(screen.queryByRole('button', { name: 'Back to list' })).not.toBeInTheDocument()
  })

  it('keeps the list in view while showing the chosen item, marked as current', async () => {
    setScreenWidth(1280)
    const user = userEvent.setup()
    renderAt('/credit')

    await user.click(screen.getByRole('link', { name: 'Bharat' }))

    expect(screen.getByRole('heading', { name: 'Bharat ledger' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Clients' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Bharat' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('ListDetail below desktop width', () => {
  resetScreenWidthAfterEach()

  it('shows only the list until an item is chosen', () => {
    setScreenWidth(390)
    renderAt('/credit')

    expect(screen.getByRole('navigation', { name: 'Clients' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Client details' })).not.toBeInTheDocument()
  })

  it('opens the chosen item as its own screen and Back returns to the list with focus on that item', async () => {
    setScreenWidth(800)
    const user = userEvent.setup()
    renderAt('/credit')

    await user.click(screen.getByRole('link', { name: 'Bharat' }))

    const detail = screen.getByRole('region', { name: 'Client details' })
    expect(detail).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Bharat ledger' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Clients' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to list' }))

    expect(screen.queryByRole('region', { name: 'Client details' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bharat' })).toHaveFocus()
  })

  it('keeps the list mounted while the detail is open, so its state survives Back', () => {
    setScreenWidth(390)
    renderAt('/credit?client=Acme')

    expect(screen.getByRole('heading', { name: 'Acme ledger' })).toBeInTheDocument()
    expect(screen.getByRole('link', { hidden: true, name: 'Acme' })).not.toBeVisible()
  })
})
