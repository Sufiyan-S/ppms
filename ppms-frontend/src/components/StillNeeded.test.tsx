import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StillNeeded } from './StillNeeded'

describe('StillNeeded', () => {
  it('shows nothing once every item is in', () => {
    const { container } = render(<StillNeeded id="needed" items={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('lists what is missing under the given id so a disabled action can point to it', () => {
    render(
      <>
        <StillNeeded id="needed" items={['Amount', 'Payment mode']} />
        <button type="button" disabled aria-describedby="needed">Save</button>
      </>,
    )

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Amount', 'Payment mode'])
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAccessibleDescription('Still needed Amount Payment mode')
  })
})
