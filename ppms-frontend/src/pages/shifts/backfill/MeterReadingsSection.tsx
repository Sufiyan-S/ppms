import { roundToPaise } from '../../../utils/money'
import { FUEL_LABELS } from '../../../constants/fuel'
import { SectionLabel } from './SectionLabel'
import { fmt } from './backfillHelpers'
import type { BackfillForm } from './useBackfillForm'

export function MeterReadingsSection({ form }: { form: BackfillForm }) {
  const { selectedNozzleIds, openingReadings, setOpeningReadings, closingReadings, setClosingReadings, availableNozzles, litersForNozzle, getEffectiveRate, nozzleExpected } = form
  return (
    <>
      {selectedNozzleIds.size > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          <SectionLabel>Meter Readings</SectionLabel>
          {[...selectedNozzleIds].map((nozzleId) => {
            const nozzle = availableNozzles.find((n) => n.id === nozzleId)
            if (!nozzle) return null
            const liters = litersForNozzle(nozzleId)
            const rate   = getEffectiveRate(nozzle.fuelType)
            const amount = nozzleExpected[nozzleId]
            return (
              <div key={nozzleId} className="bg-white rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600">
                    Nozzle #{nozzle.nozzleNumber} · {FUEL_LABELS[nozzle.fuelType] ?? nozzle.fuelType}
                  </p>
                  {amount !== null && (
                    <span className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-100 rounded px-2 py-0.5">
                      ₹{fmt(amount)}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block">
                      <span className="ui-label text-xs">Opening <span className="text-red-500">*</span></span>
                      <input
                        type="number" min="0" step="0.001" placeholder="0.000"
                        value={openingReadings[nozzleId] ?? ''}
                        onChange={(e) => setOpeningReadings((r) => ({ ...r, [nozzleId]: e.target.value }))}
                        className="ui-input"
                        required
                      />
                    </label>
                  </div>
                  <div>
                    <label className="block">
                      <span className="ui-label text-xs">Closing <span className="text-red-500">*</span></span>
                      <input
                        type="number" min="0" step="0.001" placeholder="0.000"
                        value={closingReadings[nozzleId] ?? ''}
                        onChange={(e) => setClosingReadings((r) => ({ ...r, [nozzleId]: e.target.value }))}
                        className="ui-input"
                        required
                      />
                    </label>
                  </div>
                </div>
                {liters !== null && liters >= 0 && rate !== null && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{liters.toFixed(3)} L</span>
                    {' × '}
                    <span className="font-semibold text-slate-700">₹{rate.toFixed(2)}</span>
                    {' = '}
                    <span className="font-bold text-emerald-700">₹{fmt(roundToPaise(liters * rate))}</span>
                  </p>
                )}
                {liters !== null && liters >= 0 && rate === null && (
                  <p className="mt-1.5 text-xs text-amber-600">{liters.toFixed(3)} L sold — enter fuel rate above to see expected amount</p>
                )}
                {liters !== null && liters < 0 && (
                  <p className="mt-1.5 text-xs text-red-600">Closing must be ≥ opening.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
