import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useVisibleLayout } from '../test/layout'
import { ModalPortal } from './ModalPortal'

function Dialog({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <ModalPortal onClose={onClose}>
      <h2 className="ui-modal-title">{title}</h2>
      <button type="button" className="ui-modal-close" aria-label="Close">x</button>
      <input aria-label={`${title} name`} />
      <button type="button">{title} save</button>
    </ModalPortal>
  )
}

function Opener() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open && <Dialog title="Edit" onClose={() => setOpen(false)} />}
    </>
  )
}

describe('ModalPortal', () => {
  useVisibleLayout()

  it('renders a modal dialog named by its title', () => {
    render(<Dialog title="Edit pump" />)
    const dialog = screen.getByRole('dialog', { name: 'Edit pump' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.parentElement).toBe(document.body)
  })

  it('moves focus to the first field, skipping the close button', () => {
    render(<Dialog title="Edit" />)
    expect(screen.getByLabelText('Edit name')).toHaveFocus()
  })

  it('prefers an element marked data-autofocus', () => {
    render(
      <ModalPortal>
        <input aria-label="first" />
        <button type="button" data-autofocus>preferred</button>
      </ModalPortal>,
    )
    expect(screen.getByRole('button', { name: 'preferred' })).toHaveFocus()
  })

  it('focuses the dialog itself when it has nothing focusable', () => {
    render(<ModalPortal><p>Only text</p></ModalPortal>)
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup()
    render(<><button type="button">outside</button><Dialog title="Edit" /></>)
    const close = screen.getByRole('button', { name: 'Close' })
    const save = screen.getByRole('button', { name: 'Edit save' })

    save.focus()
    await user.tab()
    expect(close).toHaveFocus()

    await user.tab({ shift: true })
    expect(save).toHaveFocus()
  })

  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup()
    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('stays open on Escape while no onClose is given', async () => {
    const user = userEvent.setup()
    render(<Dialog title="Saving" />)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lets only the top dialog react to Escape when dialogs are nested', async () => {
    const user = userEvent.setup()
    const outerClose = vi.fn()
    const innerClose = vi.fn()
    render(
      <>
        <Dialog title="Outer" onClose={outerClose} />
        <Dialog title="Inner" onClose={innerClose} />
      </>,
    )
    await user.keyboard('{Escape}')
    expect(innerClose).toHaveBeenCalledOnce()
    expect(outerClose).not.toHaveBeenCalled()
  })

  it('lets the outer dialog react again once the inner one closes', async () => {
    const user = userEvent.setup()
    const outerClose = vi.fn()
    const { rerender } = render(<><Dialog title="Outer" onClose={outerClose} /><Dialog title="Inner" /></>)
    rerender(<Dialog title="Outer" onClose={outerClose} />)
    await user.keyboard('{Escape}')
    expect(outerClose).toHaveBeenCalledOnce()
  })
})

describe('ModalPortal backdrop and focus return', () => {
  useVisibleLayout()

  function BackdropDialog({ onClose, closeOnBackdropClick }: { onClose: () => void; closeOnBackdropClick: boolean }) {
    return (
      <ModalPortal onClose={onClose} closeOnBackdropClick={closeOnBackdropClick}>
        <div className="ui-modal-backdrop" data-testid="backdrop">
          <div className="ui-modal-panel">
            <h2 className="ui-modal-title">Record</h2>
            <input aria-label="Amount" />
          </div>
        </div>
      </ModalPortal>
    )
  }

  it('closes when the backdrop itself is clicked, but not when the panel is clicked', async () => {
    const onClose = vi.fn()
    render(<BackdropDialog onClose={onClose} closeOnBackdropClick />)
    await userEvent.click(screen.getByLabelText('Amount'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores backdrop clicks unless asked to close on them', async () => {
    const onClose = vi.fn()
    render(<BackdropDialog onClose={onClose} closeOnBackdropClick={false} />)
    await userEvent.click(screen.getByTestId('backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus to main when the element that opened the modal is gone', async () => {
    function RowThatDisappears() {
      const [rowVisible, setRowVisible] = useState(true)
      const [open, setOpen] = useState(false)
      return (
        <main tabIndex={-1}>
          {rowVisible && <button type="button" onClick={() => { setOpen(true); setRowVisible(false) }}>Delete row</button>}
          {open && (
            <ModalPortal onClose={() => setOpen(false)}>
              <h2 className="ui-modal-title">Deleted</h2>
              <button type="button" onClick={() => setOpen(false)}>OK</button>
            </ModalPortal>
          )}
        </main>
      )
    }
    render(<RowThatDisappears />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete row' }))
    await userEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.getByRole('main')).toHaveFocus()
  })
})
