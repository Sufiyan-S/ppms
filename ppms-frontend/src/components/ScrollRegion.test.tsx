import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScrollRegion } from './ScrollRegion'

describe('ScrollRegion', () => {
  it('is a named region that keyboard users can focus to scroll', () => {
    render(<ScrollRegion label="Active shifts" className="overflow-x-auto"><table /></ScrollRegion>)
    const region = screen.getByRole('region', { name: 'Active shifts' })
    expect(region).toHaveAttribute('tabindex', '0')
  })
})
