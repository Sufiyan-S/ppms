/**
 * Formats a number as Indian Rupee currency: ₹1,23,456.00
 */
export function formatCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Formats a litre value to 3 decimal places: 1,234.567 L
 */
export function formatLitres(n: number): string {
  return `${n.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} L`
}

/**
 * Formats a number to exactly 2 decimal places without the ₹ prefix.
 * Useful for input display and unit prices.
 */
export function formatDecimal(n: number, decimals = 2): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
