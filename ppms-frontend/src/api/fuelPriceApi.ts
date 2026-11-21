import client from './client'

export interface FuelPriceForDate {
  fuelType: string
  /** Null when no price has been recorded for this fuel type on or before the requested date. */
  pricePerUnit: number | null
}

export const fuelPriceApi = {
  /**
   * Returns the effective price for every fuel type at this pump on the given historical date,
   * as of the start of the given shift window when one is passed.
   * pricePerUnit is null when no price record exists by then.
   */
  getForDate: (pumpId: number, date: string, shiftDefinitionId?: number | null): Promise<FuelPriceForDate[]> =>
    client.get(`/pumps/${pumpId}/fuel-prices/for-date`, {
      params: { date, shiftDefinitionId: shiftDefinitionId ?? undefined },
    }).then(r => r.data),
}
