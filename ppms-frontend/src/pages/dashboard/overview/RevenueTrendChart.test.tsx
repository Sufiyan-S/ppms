import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RevenueTrendChart } from './RevenueTrendChart'

describe('RevenueTrendChart', () => {
  it('keeps the card with an explanation when there is no closed shift revenue yet', () => {
    render(<RevenueTrendChart historyShifts={[]} />)

    expect(screen.getByText('Revenue Trend')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No closed shift revenue in the last 7 days.')
    expect(screen.getByRole('button', { name: 'Last 14 days' })).toBeInTheDocument()
  })
})
