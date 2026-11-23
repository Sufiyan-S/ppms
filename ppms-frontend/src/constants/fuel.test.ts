import { beforeAll, describe, expect, it, vi } from 'vitest'

type FuelModule = typeof import('./fuel')
let fuel: FuelModule

beforeAll(async () => {
  const themeColors = { ok: '#000001', accent: '#000002', primary: '#000003', 'ink-3': '#000004', warn: '#000005' }
  for (const [name, value] of Object.entries(themeColors)) {
    document.documentElement.style.setProperty(`--color-${name}`, value)
  }
  vi.resetModules()
  fuel = await import('./fuel')
})

describe('fuel colours', () => {
  it('gives every labelled fuel a badge, a tank colour and a chart colour from the theme', () => {
    for (const code of Object.keys(fuel.FUEL_LABELS)) {
      expect(fuel.FUEL_BADGE[code]).toBeTruthy()
      expect(fuel.FUEL_STOCK_COLORS[code].bar).toBeTruthy()
      expect(fuel.FUEL_CHART_COLORS[code]).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(fuel.FUEL_CHART_COLORS.PETROL).toBe('#000001')
  })

  it('gives each fuel a different chart colour', () => {
    const colours = Object.values(fuel.FUEL_CHART_COLORS)
    expect(new Set(colours).size).toBe(colours.length)
  })

  it('uses the same colour for speed petrol in badges, bordered badges and tank bars', () => {
    expect(fuel.FUEL_BADGE_WITH_BORDER.SPEED_PETROL.startsWith(fuel.FUEL_BADGE.SPEED_PETROL)).toBe(true)
    expect(fuel.FUEL_STOCK_COLORS.SPEED_PETROL.badge).toBe(fuel.FUEL_BADGE.SPEED_PETROL)
    expect(fuel.FUEL_BADGE.SPEED_PETROL).toContain('accent')
  })
})
