export interface PriceChange {
  amount: number
  /** null when there is no current price to compare with. */
  percent: number | null
}

/** How far a typed price moves from the current one; null until a positive price is typed. */
export function priceChange(currentPrice: number | undefined, typedPrice: string): PriceChange | null {
  const next = Number(typedPrice)
  if (typedPrice.trim() === '' || !Number.isFinite(next) || next <= 0) return null
  if (currentPrice == null) return { amount: 0, percent: null }
  const amount = Math.round((next - currentPrice) * 100) / 100
  const percent = currentPrice > 0 ? (amount / currentPrice) * 100 : null
  return { amount, percent }
}
