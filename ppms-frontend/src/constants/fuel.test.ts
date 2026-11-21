import { describe, expect, it } from 'vitest'
import { FUEL_BADGE, FUEL_BADGE_WITH_BORDER, FUEL_CHART_COLORS, FUEL_LABELS, FUEL_STOCK_COLORS } from './fuel'

describe('fuel colours', () => {
  it('gives every labelled fuel a badge, a tank colour and a chart colour', () => {
    for (const fuel of Object.keys(FUEL_LABELS)) {
      expect(FUEL_BADGE[fuel]).toBeTruthy()
      expect(FUEL_STOCK_COLORS[fuel].bar).toBeTruthy()
      expect(FUEL_CHART_COLORS[fuel]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('uses the same colour for speed petrol in badges, bordered badges and tank bars', () => {
    expect(FUEL_BADGE_WITH_BORDER.SPEED_PETROL.startsWith(FUEL_BADGE.SPEED_PETROL)).toBe(true)
    expect(FUEL_STOCK_COLORS.SPEED_PETROL.badge).toBe(FUEL_BADGE.SPEED_PETROL)
    expect(FUEL_BADGE.SPEED_PETROL).toContain('teal')
  })
})
