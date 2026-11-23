import { themeColor } from './chartColors'

export const FUEL_LABELS: Record<string, string> = {
  PETROL: 'Petrol', SPEED_PETROL: 'Speed Petrol',
  DIESEL: 'Diesel', SPEED_DIESEL: 'Speed Diesel', CNG: 'CNG',
}

export const FUEL_UNIT: Record<string, string> = {
  PETROL: 'L', SPEED_PETROL: 'L', DIESEL: 'L', SPEED_DIESEL: 'L', CNG: 'kg',
}

interface FuelTone { badge: string; border: string; bar: string; text: string; chart: string }

// One colour per fuel across badges, tank bars and charts; the fuel name is always shown beside it.
const FUEL_TONES: Record<string, FuelTone> = {
  PETROL:       { badge: 'bg-ok-bg text-ok',               border: 'border-ok',      bar: 'bg-ok',      text: 'text-ok',          chart: themeColor('ok') },
  SPEED_PETROL: { badge: 'bg-accent/20 text-warn-strong',  border: 'border-accent',  bar: 'bg-accent',  text: 'text-warn-strong', chart: themeColor('accent') },
  DIESEL:       { badge: 'bg-info-bg text-info',           border: 'border-info',    bar: 'bg-primary', text: 'text-info',        chart: themeColor('primary') },
  SPEED_DIESEL: { badge: 'bg-neutral-bg text-neutral',     border: 'border-control', bar: 'bg-ink-3',   text: 'text-neutral',     chart: themeColor('ink-3') },
  CNG:          { badge: 'bg-warn-bg text-warn',           border: 'border-warn',    bar: 'bg-warn',    text: 'text-warn',        chart: themeColor('warn') },
}

function mapTones<T>(pick: (tone: FuelTone) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(FUEL_TONES).map(([fuel, tone]) => [fuel, pick(tone)]))
}

export const FUEL_BADGE: Record<string, string> = mapTones((tone) => tone.badge)
export const FUEL_BADGE_WITH_BORDER: Record<string, string> = mapTones((tone) => `${tone.badge} ${tone.border}`)
export const FUEL_STOCK_COLORS: Record<string, { bar: string; text: string; badge: string }> =
  mapTones((tone) => ({ bar: tone.bar, text: tone.text, badge: tone.badge }))
export const FUEL_CHART_COLORS: Record<string, string> = mapTones((tone) => tone.chart)
