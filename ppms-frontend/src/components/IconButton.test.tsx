import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('uses the label as its accessible name and tooltip and hides the icon', () => {
    render(<IconButton label="Edit tank" icon={<svg data-testid="icon" />} />)
    const button = screen.getByRole('button', { name: 'Edit tank' })
    expect(button).toHaveAttribute('title', 'Edit tank')
    expect(button).toHaveAttribute('type', 'button')
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps a custom title and forwards clicks and the ref', async () => {
    const onClick = vi.fn()
    const ref = createRef<HTMLButtonElement>()
    render(<IconButton ref={ref} label="Delete" title="Delete row" icon="x" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveAttribute('title', 'Delete row')
    expect(ref.current).toBe(button)
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
