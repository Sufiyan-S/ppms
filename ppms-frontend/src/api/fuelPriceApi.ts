import client from './client'

export interface FuelPriceForDate {
  fuelType: string
  /** Null when no price has been recorded for this fuel type on or before the requested date. */
  pricePerUnit: number | null
}

export const fuelPriceApi = {
  /**
   * Returns the effective price for every fuel type at this pump on the given historical date.
   * pricePerUnit is null when no price record exists on or before that date.
   * Used by the backfill shift modal to resolve historical rates and flag which ones need manual entry.
   */
  getForDate: (pumpId: number, date: string): Promise<FuelPriceForDate[]> =>
    client.get('/fuel-prices/for-date', { params: { pumpId, date } }).then(r => r.data),
}
