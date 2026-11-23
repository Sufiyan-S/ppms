import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PendingByAgeCard } from './PendingByAgeCard'

describe('PendingByAgeCard', () => {
  it('lists unsettled runs by type, dates, amount and age, and says which are overdue', () => {
    render(<PendingByAgeCard isLoading={false} error={null} ranges={[
      { paymentType: 'UPI', fromDate: '2026-11-18', toDate: '2026-11-20', amount: 25248, ageDays: 5, overdue: true, days: [] },
      { paymentType: 'CARD', fromDate: '2026-11-22', toDate: '2026-11-22', amount: 900, ageDays: 1, overdue: false, days: [] },
    ]} />)

    expect(screen.getByText('UPI 18–20 Nov')).toBeInTheDocument()
    expect(screen.getByText('5 days · overdue')).toBeInTheDocument()
    expect(screen.getByText('Card 22 Nov')).toBeInTheDocument()
    expect(screen.getByText('1 day')).toBeInTheDocument()
    expect(screen.getByText('1 overdue')).toBeInTheDocument()
  })

  it('says when everything is settled', () => {
    render(<PendingByAgeCard isLoading={false} error={null} ranges={[]} />)
    expect(screen.getByText('Everything collected has been settled.')).toBeInTheDocument()
  })
})
