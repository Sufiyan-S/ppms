export const FUEL_LABELS: Record<string, string> = {
  PETROL: 'Petrol', SPEED_PETROL: 'Speed Petrol',
  DIESEL: 'Diesel', SPEED_DIESEL: 'Speed Diesel', CNG: 'CNG',
}

export const FUEL_UNIT: Record<string, string> = {
  PETROL: 'L', SPEED_PETROL: 'L', DIESEL: 'L', SPEED_DIESEL: 'L', CNG: 'kg',
}

interface FuelTone { badge: string; border: string; bar: string; text: string; chart: string }

// One colour per fuel across badges, tank bars and charts.
const FUEL_TONES: Record<string, FuelTone> = {
  PETROL:       { badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-300', bar: 'bg-emerald-500', text: 'text-emerald-700', chart: '#10b981' },
  SPEED_PETROL: { badge: 'bg-teal-100 text-teal-700',       border: 'border-teal-300',    bar: 'bg-teal-500',    text: 'text-teal-700',    chart: '#0d9488' },
  DIESEL:       { badge: 'bg-blue-100 text-blue-700',       border: 'border-blue-300',    bar: 'bg-blue-500',    text: 'text-blue-700',    chart: '#3b82f6' },
  SPEED_DIESEL: { badge: 'bg-indigo-100 text-indigo-700',   border: 'border-indigo-300',  bar: 'bg-indigo-500',  text: 'text-indigo-700',  chart: '#6366f1' },
  CNG:          { badge: 'bg-amber-100 text-amber-700',     border: 'border-amber-300',   bar: 'bg-amber-500',   text: 'text-amber-700',   chart: '#f59e0b' },
}

function mapTones<T>(pick: (tone: FuelTone) => T): Record<string, T> {
  return Object.fromEntries(Object.entries(FUEL_TONES).map(([fuel, tone]) => [fuel, pick(tone)]))
}

export const FUEL_BADGE: Record<string, string> = mapTones((tone) => tone.badge)
export const FUEL_BADGE_WITH_BORDER: Record<string, string> = mapTones((tone) => `${tone.badge} ${tone.border}`)
export const FUEL_STOCK_COLORS: Record<string, { bar: string; text: string; badge: string }> =
  mapTones((tone) => ({ bar: tone.bar, text: tone.text, badge: tone.badge }))
export const FUEL_CHART_COLORS: Record<string, string> = mapTones((tone) => tone.chart)
