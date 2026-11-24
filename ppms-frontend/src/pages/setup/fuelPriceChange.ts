export type PriceDirection = 'up' | 'down' | 'same' | 'first'

export interface PriceChange {
  amount: number
  /** null when there is no current price to compare with. */
  percent: number | null
  /** 'first' when the fuel has no current price yet. */
  direction: PriceDirection
}

/** How far a typed price moves from the current one; null until a positive price is typed. */
export function priceChange(currentPrice: number | undefined, typedPrice: string): PriceChange | null {
  const next = Number(typedPrice)
  if (typedPrice.trim() === '' || !Number.isFinite(next) || next <= 0) return null
  if (currentPrice == null) return { amount: 0, percent: null, direction: 'first' }
  const amount = Math.round((next - currentPrice) * 100) / 100
  const percent = currentPrice > 0 ? (amount / currentPrice) * 100 : null
  const direction = amount > 0 ? 'up' : amount < 0 ? 'down' : 'same'
  return { amount, percent, direction }
}
