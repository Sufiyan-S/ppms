import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoadError } from './LoadError'

describe('LoadError', () => {
  it('shows the default message and calls onRetry when Retry is pressed', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<LoadError onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this. Check your connection and retry.')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows a given message instead of the default', () => {
    render(<LoadError onRetry={vi.fn()} message="Sales could not be loaded." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sales could not be loaded.')
  })
})
