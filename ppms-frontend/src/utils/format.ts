import { formatLitresIn, formatNumberIn, formatRupees } from '../i18n/format'

/**
 * Formats a number as Indian Rupee currency: ₹1,23,456.00
 */
export function formatCurrency(n: number): string {
  return formatRupees(n)
}

/**
 * Formats a litre value, 3 decimal places by default: 1,234.567 L
 */
export function formatLitres(n: number, decimals = 3): string {
  return formatLitresIn(n, decimals)
}

/**
 * Formats a number to exactly 2 decimal places without the ₹ prefix.
 * Useful for input display and unit prices.
 */
export function formatDecimal(n: number, decimals = 2): string {
  return formatNumberIn(n, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Prefixes "+" or "−" (minus sign) to the formatted size of n; zero gets no sign. */
export function formatWithSign(n: number, format: (value: number) => string): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${format(Math.abs(n))}`
}

export function formatCurrencyOrDash(n: number | null | undefined): string {
  return n != null ? formatCurrency(Number(n)) : '—'
}
