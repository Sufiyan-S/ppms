import { FUEL_LABELS } from '../../../constants/fuel'
import { SectionLabel } from './SectionLabel'
import type { BackfillForm } from './useBackfillForm'

export function FuelRatesSection({ form }: { form: BackfillForm }) {
  const { shiftDate, selectedNozzleIds, fuelRateInputs, setFuelRateInputs, dbPriceMap, selectedFuelTypes } = form
  return (
    <>
      {selectedNozzleIds.size > 0 && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2.5">
          <SectionLabel>Fuel Rates on {shiftDate}</SectionLabel>

          {[...selectedFuelTypes].map((fuelType) => {
            const dbPrice  = dbPriceMap[fuelType]
            const hasPrice = typeof dbPrice === 'number'

            return (
              <div key={fuelType} className="flex items-center gap-3 rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-semibold text-slate-700 w-28 shrink-0">
                  {FUEL_LABELS[fuelType] ?? fuelType}
                </span>

                {hasPrice ? (
                  /* ── DB price, read-only display ── */
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2.5 py-1">
                      ₹{dbPrice!.toFixed(2)}/L
                    </span>
                    <span className="text-[11px] text-slate-500">
                      from price history · to change it, correct the price history first
                    </span>
                  </div>
                ) : (
                  /* ── Manual input (no DB price) ── */
                  <div className="flex items-center gap-2 flex-1">
                    <div className="relative flex-1 max-w-[140px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">₹</span>
                      <input aria-label={`${FUEL_LABELS[fuelType] ?? fuelType} rate per litre`}
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        value={fuelRateInputs[fuelType] ?? ''}
                        onChange={(e) => setFuelRateInputs(r => ({ ...r, [fuelType]: e.target.value }))}
                        className="ui-input pl-6 text-sm"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500">/L</span>
                    <span className="text-[11px] text-amber-600 font-medium">
                      No price on record — enter manually
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
