import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FormEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useVisibleLayout } from '../test/layout'
import { resetScreenWidthAfterEach, setScreenWidth } from '../test/screenWidth'
import { Modal } from './Modal'

function panelOf(dialog: HTMLElement) {
  return dialog.querySelector('.ui-modal-panel') as HTMLElement
}

function giveThePanelAnAnimation() {
  const original = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = original.call(window, element, pseudo)
    if (element.classList.contains('ui-modal-panel')) Object.defineProperty(style, 'animationName', { value: 'ppms-modal-in' })
    return style
  })
}

describe('Modal', () => {
  useVisibleLayout()
  resetScreenWidthAfterEach()

  it('renders a modal dialog named by its title with the subtitle, body and footer', () => {
    render(
      <Modal title="Resolve discrepancy" subtitle="Shift #4" tone="danger" onClose={() => {}} footer={<button type="button">Save</button>}>
        <input aria-label="Note" />
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Resolve discrepancy' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Shift #4')).toHaveClass('ui-modal-subtitle')
    expect(dialog.querySelector('.ui-modal-header')).toHaveClass('ui-modal-header--themed', 'ui-modal-header--danger')
    expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveClass('ui-modal-footer')
    expect(screen.getByLabelText('Note')).toHaveFocus()
  })

  it('closes from the Close button and Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal title="Edit" tone="info" onClose={onClose}><p>Body</p></Modal>)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('stays open while it cannot be closed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal title="Saving" tone="info" onClose={onClose} canClose={false}><p>Body</p></Modal>)
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('submits the body and footer as one form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: FormEvent) => event.preventDefault())
    render(
      <Modal title="Add" tone="info" onClose={() => {}} onSubmit={onSubmit} footer={<button type="submit">Add entry</button>}>
        <input aria-label="Amount" />
      </Modal>,
    )
    await user.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('fills the phone screen and sizes the panel when asked', () => {
    render(<Modal title="Review" tone="info" size="full" fullScreenOnPhone onClose={() => {}}><p>Body</p></Modal>)
    const panel = screen.getByRole('dialog').querySelector('.ui-modal-panel')
    expect(panel).toHaveClass('ui-modal-panel--lg')
    expect(panel?.parentElement).toHaveClass('ui-modal-backdrop--fullscreen')
  })

  it('offers a width between the medium and large panels', () => {
    render(<Modal title="Open New Shift" tone="info" size="md-wide" onClose={() => {}}><p>Body</p></Modal>)
    expect(screen.getByRole('dialog').querySelector('.ui-modal-panel')).toHaveClass('w-full', 'max-w-140')
  })

  it('shows the tone icon beside the title, and none for a neutral dialog', () => {
    const { unmount } = render(<Modal title="Void" tone="danger" onClose={() => {}}><p>Body</p></Modal>)
    const icon = screen.getByRole('dialog').querySelector('.ui-modal-tone-icon')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon?.querySelector('svg')).toBeInTheDocument()
    unmount()

    render(<Modal title="Details" tone="neutral" onClose={() => {}}><p>Body</p></Modal>)
    expect(screen.getByRole('dialog').querySelector('.ui-modal-tone-icon')).not.toBeInTheDocument()
  })

  describe('after something was typed', () => {
    function renderTypedForm(props: { confirmDiscard?: boolean; canClose?: boolean } = {}) {
      const onClose = vi.fn()
      render(
        <Modal title="Add expense" tone="info" onClose={onClose} closeOnBackdropClick {...props}
          footer={<button type="button" onClick={onClose}>Cancel</button>}>
          <input aria-label="Amount" />
        </Modal>,
      )
      return onClose
    }

    it('asks before discarding from the Close button, with focus on Keep editing', async () => {
      const user = userEvent.setup()
      const onClose = renderTypedForm()
      await user.type(screen.getByLabelText('Amount'), '250')
      await user.click(screen.getByRole('button', { name: 'Close' }))

      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('goes back to the form on Keep editing, keeping what was typed', async () => {
      const user = userEvent.setup()
      const onClose = renderTypedForm()
      await user.type(screen.getByLabelText('Amount'), '250')
      await user.click(screen.getByRole('button', { name: 'Close' }))
      await user.click(screen.getByRole('button', { name: 'Keep editing' }))

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByLabelText('Amount')).toHaveValue('250')
      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('closes on Discard', async () => {
      const user = userEvent.setup()
      const onClose = renderTypedForm()
      await user.type(screen.getByLabelText('Amount'), '250')
      await user.keyboard('{Escape}')
      await user.click(screen.getByRole('button', { name: 'Discard' }))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('keeps editing when Escape is pressed on the question, returning focus to the field', async () => {
      const user = userEvent.setup()
      const onClose = renderTypedForm()
      await user.type(screen.getByLabelText('Amount'), '250')
      await user.keyboard('{Escape}')
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Amount')).toHaveFocus()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('asks before discarding from a backdrop click', async () => {
      const user = userEvent.setup()
      const onClose = renderTypedForm()
      await user.type(screen.getByLabelText('Amount'), '250')
      await user.click(document.querySelector('.ui-modal-backdrop') as HTMLElement)
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('still closes straight away from a Cancel button the dialog provides', async () => {
      const user = userEvent.setup()
      const onClose = renderTypedForm()
      await user.type(screen.getByLabelText('Amount'), '250')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('closes straight away when the dialog opts out of the question', async () => {
      const user = userEvent.setup()
      const onClose = renderTypedForm({ confirmDiscard: false })
      await user.type(screen.getByLabelText('Amount'), '250')
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('neither closes nor asks while it cannot be closed', async () => {
      const user = userEvent.setup()
      const onClose = renderTypedForm({ canClose: false })
      await user.type(screen.getByLabelText('Amount'), '250')
      await user.keyboard('{Escape}')
      await user.click(document.querySelector('.ui-modal-backdrop') as HTMLElement)

      expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  it('closes straight away when nothing was changed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Modal title="Add expense" tone="info" onClose={onClose}><input aria-label="Amount" /></Modal>)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('marks the panel while its body is scrolled and while more content is below', () => {
    render(<Modal title="Long list" tone="info" onClose={() => {}} footer={<button type="button">Save</button>}><p>Rows</p></Modal>)
    const panel = panelOf(screen.getByRole('dialog'))
    const body = panel.querySelector('.ui-modal-body') as HTMLElement
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 300 })
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 900 })

    fireEvent.scroll(body, { target: { scrollTop: 0 } })
    expect(panel).not.toHaveAttribute('data-scrolled')
    expect(panel).toHaveAttribute('data-more-below')

    fireEvent.scroll(body, { target: { scrollTop: 600 } })
    expect(panel).toHaveAttribute('data-scrolled')
    expect(panel).not.toHaveAttribute('data-more-below')
  })

  it('rises as a bottom sheet with a grab handle on phones, but not when it fills the screen', () => {
    setScreenWidth(390)
    const { unmount } = render(<Modal title="Edit" tone="info" onClose={() => {}}><p>Body</p></Modal>)
    expect(document.querySelector('.ui-modal-backdrop')).toHaveClass('ui-modal-backdrop--sheet')
    expect(screen.getByText('Drag down to close')).toHaveClass('sr-only')
    unmount()

    render(<Modal title="Review" tone="info" fullScreenOnPhone onClose={() => {}}><p>Body</p></Modal>)
    expect(document.querySelector('.ui-modal-backdrop')).not.toHaveClass('ui-modal-backdrop--sheet')
    expect(screen.queryByText('Drag down to close')).not.toBeInTheDocument()
  })

  it('plays the exit animation before closing', () => {
    giveThePanelAnAnimation()
    const onClose = vi.fn()
    render(<Modal title="Edit" tone="info" onClose={onClose}><p>Body</p></Modal>)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(document.querySelector('.ui-modal-backdrop')).toHaveAttribute('data-closing')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.animationEnd(panelOf(screen.getByRole('dialog')))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes anyway when the exit animation never reports its end', () => {
    vi.useFakeTimers()
    try {
      giveThePanelAnAnimation()
      const onClose = vi.fn()
      render(<Modal title="Edit" tone="info" onClose={onClose}><p>Body</p></Modal>)
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(300) })
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
