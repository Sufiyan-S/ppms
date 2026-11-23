/** Reads a colour token (e.g. "ok" for --color-ok) from the @theme variables on :root; recharts needs plain colour strings. */
export function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim()
}

export const CHART_COLORS = {
  primary: themeColor('primary'),
  ok: themeColor('ok'),
  bad: themeColor('bad'),
  warn: themeColor('warn'),
  info: themeColor('info'),
  accent: themeColor('accent'),
  grid: themeColor('border'),
  axis: themeColor('ink-3'),
}

export const CHART_TOOLTIP_STYLE = {
  fontSize: '0.75rem',
  borderRadius: '8px',
  border: `1px solid ${CHART_COLORS.grid}`,
  padding: '0.5rem 0.75rem',
  boxShadow: 'var(--shadow-overlay)',
}

export function compactRupees(value: number): string {
  const size = Math.abs(value)
  if (size >= 100_000) return `₹${(value / 100_000).toFixed(1)}L`
  if (size >= 1_000) return `₹${(value / 1_000).toFixed(0)}k`
  return `₹${value}`
}
