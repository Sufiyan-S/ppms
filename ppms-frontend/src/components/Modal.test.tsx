import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FormEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useVisibleLayout } from '../test/layout'
import { Modal } from './Modal'

describe('Modal', () => {
  useVisibleLayout()

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
})
