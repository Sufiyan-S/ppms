import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmButton } from './ConfirmButton'

describe('ConfirmButton', () => {
  it('asks for confirmation and focuses No first', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmButton onConfirm={onConfirm} triggerAriaLabel="Remove entry" prompt="Remove?" />)
    await user.click(screen.getByRole('button', { name: 'Remove entry' }))
    expect(screen.getByRole('group', { name: 'Remove?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No' })).toHaveFocus()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm on Yes and collapses back', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmButton onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('cancels on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmButton onConfirm={onConfirm} triggerLabel="Void" triggerAriaLabel="Void entry" />)
    await user.click(screen.getByRole('button', { name: 'Void entry' }))
    await user.keyboard('{Escape}')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Void entry' })).toHaveFocus()
  })

  it('cancels on No', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ConfirmButton onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'No' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('cannot be triggered while disabled', () => {
    render(<ConfirmButton onConfirm={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })
})
