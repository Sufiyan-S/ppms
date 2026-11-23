import { istDateString } from './date'

/** Fuel prices are stale when none are set or any of them was last set before today (IST). */
export function isPriceStale(prices: { effectiveFrom: string }[]): boolean {
  const today = istDateString()
  return prices.length === 0 || prices.some((price) => istDateString(new Date(price.effectiveFrom)) < today)
}
