import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PeriodChangeNote } from './PeriodChangeNote'

describe('PeriodChangeNote', () => {
  it('says a rise in revenue in words, with the arrow and the good colour', () => {
    render(<PeriodChangeNote current={1200} previous={1000} />)
    const note = screen.getByText(/20% up vs previous period/)
    expect(note).toHaveTextContent('▲ 20% up vs previous period')
    expect(note).toHaveClass('text-ok')
  })

  it('treats a rise in cost as bad', () => {
    render(<PeriodChangeNote current={1200} previous={1000} higherIsBetter={false} />)
    expect(screen.getByText(/20% up/)).toHaveClass('text-bad')
  })

  it('says a fall, a new amount and no change', () => {
    const { rerender } = render(<PeriodChangeNote current={750} previous={1000} />)
    expect(screen.getByText(/25% down vs previous period/)).toHaveClass('text-bad')
    rerender(<PeriodChangeNote current={500} previous={0} />)
    expect(screen.getByText(/Up from zero vs previous period/)).toBeInTheDocument()
    rerender(<PeriodChangeNote current={0} previous={0} />)
    expect(screen.getByText('No change vs previous period')).toBeInTheDocument()
  })
})
