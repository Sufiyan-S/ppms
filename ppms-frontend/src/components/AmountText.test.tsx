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
  it('formats litres with Indian grouping, two decimals and the unit', () => {
    render(<><LitresText value={123456.5} /><LitresText value={12.345} /></>)
    expect(screen.getByText('1,23,456.50 L')).toHaveClass('tabular-nums')
    expect(screen.getByText('12.35 L')).toBeInTheDocument()
  })

  it('shows a dash when there is no value and a sign when asked', () => {
    render(<><LitresText value={undefined} /><LitresText value={-4.5} showSign /></>)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('−4.50 L')).toBeInTheDocument()
  })
})
