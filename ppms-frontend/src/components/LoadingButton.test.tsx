import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadingButton } from './LoadingButton'

describe('LoadingButton', () => {
  it('keeps the label in place while loading so the button keeps its width, with a spinner over it', () => {
    render(<LoadingButton isLoading loadingLabel="Saving the entry" className="ui-btn-primary">Save Entry</LoadingButton>)

    const button = screen.getByRole('button')
    expect(button).toHaveClass('ui-btn', 'ui-btn-primary')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(screen.getByText('Save Entry')).toHaveClass('ui-btn-label')
    expect(button.querySelector('.ui-btn-spinner svg')).not.toBeNull()
    expect(screen.getByText('Saving the entry')).toHaveClass('sr-only')
  })

  it('is a plain button with only its label when idle', () => {
    render(<LoadingButton isLoading={false} loadingLabel="Saving the entry">Save Entry</LoadingButton>)

    const button = screen.getByRole('button', { name: 'Save Entry' })
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button).toBeEnabled()
    expect(button.querySelector('.ui-btn-spinner')).toBeNull()
  })
})
