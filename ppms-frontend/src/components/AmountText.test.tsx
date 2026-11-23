import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LitresText, MoneyText } from './AmountText'

describe('MoneyText', () => {
  it('formats rupees with Indian grouping and two decimals', () => {
    render(<MoneyText value={123456} />)
    expect(screen.getByText('₹1,23,456.00')).toHaveClass('tabular-nums')
  })

  it('shows a dash when there is no value', () => {
    render(<MoneyText value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('puts a plus or minus sign in front when asked and colours by tone', () => {
    render(<><MoneyText value={-100} showSign tone="bad" /><MoneyText value={50.5} showSign tone="warn" /></>)
    expect(screen.getByText('−₹100.00')).toHaveClass('text-bad')
    expect(screen.getByText('+₹50.50')).toHaveClass('text-warn')
  })
})

describe('LitresText', () => {
  it('formats litres with three decimals and the unit', () => {
    render(<LitresText value={1234.5} />)
    expect(screen.getByText('1,234.500 L')).toBeInTheDocument()
  })

  it('uses the given number of decimals', () => {
    render(<><LitresText value={1234.56} decimals={1} /><LitresText value={1500} decimals={2} /></>)
    expect(screen.getByText('1,234.6 L')).toBeInTheDocument()
    expect(screen.getByText('1,500.00 L')).toBeInTheDocument()
  })
})
