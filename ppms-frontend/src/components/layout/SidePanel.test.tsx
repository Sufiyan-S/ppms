import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useVisibleLayout } from '../../test/layout'
import { SidePanel } from './SidePanel'
import { useUrlParam } from './useUrlParam'

function ShiftWithPanel() {
  const panel = useUrlParam('panel')
  const { search } = useLocation()
  return (
    <main tabIndex={-1}>
      <button type="button" onClick={() => panel.set('credit')}>View credit</button>
      <output aria-label="Address">{search}</output>
      {panel.value === 'credit' && (
        <SidePanel title="Credit Sales" subtitle="Shift #12" onClose={panel.remove} footer={<span>Total ₹500</span>}>
          <a href="#acme">Acme Transport</a>
        </SidePanel>
      )}
    </main>
  )
}

describe('SidePanel', () => {
  useVisibleLayout()

  it('is a labelled dialog that starts on its title and keeps Tab inside', async () => {
    const user = userEvent.setup()
    render(<SidePanel title="Credit Sales" onClose={vi.fn()}><a href="#acme">Acme Transport</a></SidePanel>)

    const dialog = screen.getByRole('dialog', { name: 'Credit Sales' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Credit Sales' })).toHaveFocus()

    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Acme Transport' })).toHaveFocus()
    await user.tab()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('closes on Escape, the Close button and the backdrop', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<SidePanel title="Report" onClose={onClose}><p>Body</p></SidePanel>)

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(document.querySelector('.ui-side-panel-backdrop') as HTMLElement)
    await user.click(screen.getByText('Body'))

    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('opens from a search parameter, so the view can be linked, and returns focus to the opener on close', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter initialEntries={['/shifts']}><ShiftWithPanel /></MemoryRouter>)

    const opener = screen.getByRole('button', { name: 'View credit' })
    await user.click(opener)
    expect(screen.getByRole('status', { name: 'Address' })).toHaveTextContent('?panel=credit')
    expect(screen.getByRole('dialog', { name: 'Credit Sales' })).toHaveTextContent('Total ₹500')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Address' })).toBeEmptyDOMElement()
    expect(opener).toHaveFocus()
  })

  it('has the themed header, info by default and the given tone otherwise', () => {
    const { unmount } = render(<SidePanel title="Credit Sales" onClose={vi.fn()}><p>Body</p></SidePanel>)
    expect(screen.getByRole('dialog').querySelector('.ui-modal-header'))
      .toHaveClass('ui-modal-header--themed', 'ui-modal-header--info')
    unmount()

    render(<SidePanel title="Lots" tone="warning" onClose={vi.fn()}><p>Body</p></SidePanel>)
    expect(screen.getByRole('dialog').querySelector('.ui-modal-header')).toHaveClass('ui-modal-header--warning')
  })

  it('is open straight away when the address already names it', () => {
    render(<MemoryRouter initialEntries={['/shifts?panel=credit']}><ShiftWithPanel /></MemoryRouter>)
    expect(screen.getByRole('dialog', { name: 'Credit Sales' })).toBeInTheDocument()
  })
})
