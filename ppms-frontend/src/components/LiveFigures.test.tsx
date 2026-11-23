import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiveFigures } from './LiveFigures'
import { MoneyText } from './AmountText'

describe('LiveFigures', () => {
  it('shows each figure beside its label and a dash before there is input', () => {
    render(
      <LiveFigures
        label="After this payment"
        figures={[
          { label: 'Outstanding', value: <MoneyText value={5000} /> },
          { label: 'Paying now', value: <MoneyText value={null} /> },
        ]}
      />,
    )

    const list = screen.getByLabelText('After this payment')
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Outstanding', 'Paying now'])
    expect(screen.getAllByRole('definition').map((value) => value.textContent)).toEqual(['₹5,000.00', '—'])
    expect(list.querySelectorAll('.ui-live-figures__row--result')).toHaveLength(0)
  })

  it('marks the figure the form works towards as the result row', () => {
    render(<LiveFigures figures={[{ label: 'New balance', value: <MoneyText value={1200} />, isResult: true }]} />)

    expect(screen.getByText('New balance').parentElement).toHaveClass('ui-live-figures__row--result')
  })
})
