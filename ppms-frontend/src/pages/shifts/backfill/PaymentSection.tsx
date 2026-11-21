import { Check } from 'lucide-react'
import { SectionLabel } from './SectionLabel'
import { fmt } from './backfillHelpers'
import type { BackfillForm } from './useBackfillForm'

export function PaymentSection({ form }: { form: BackfillForm }) {
  const { selectedNozzleIds, cashCollected, setCashCollected, upiCollected, setUpiCollected, cardCollected, setCardCollected, fleetCardCollected, setFleetCardCollected, allRatesResolved, totalExpected, totalCollected, discrepancyAmt } = form
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <SectionLabel>Payment Collected</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'UPI (₹)',        value: upiCollected,       set: setUpiCollected },
          { label: 'Card (₹)',        value: cardCollected,      set: setCardCollected },
          { label: 'Fleet Card (₹)', value: fleetCardCollected, set: setFleetCardCollected },
          { label: 'Cash (₹)',        value: cashCollected,      set: setCashCollected },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="block">
              <span className="ui-label text-xs">{label}</span>
              <input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="ui-input"
              />
            </label>
          </div>
        ))}
      </div>

      {/* Expected vs Collected summary */}
      {totalExpected !== null && selectedNozzleIds.size > 0 && allRatesResolved && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
          <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-600">
            <span>Expected (metered fuel sales)</span>
            <span className="font-semibold text-slate-800">₹{fmt(totalExpected)}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-600">
            <span>Collected (UPI + card + fleet + cash + credit)</span>
            <span className="font-semibold text-slate-800">₹{fmt(totalCollected)}</span>
          </div>
          {discrepancyAmt !== null && (
            <div className={`flex items-center justify-between px-3 py-2 text-xs font-semibold ${
              Math.abs(discrepancyAmt) < 0.01
                ? 'text-emerald-700 bg-emerald-50'
                : discrepancyAmt < 0
                ? 'text-red-700 bg-red-50'
                : 'text-amber-700 bg-amber-50'
            }`}>
              <span>
                {Math.abs(discrepancyAmt) < 0.01 ? <span className="inline-flex items-center gap-1">Balanced<Check size={12} strokeWidth={2.5} /></span> : discrepancyAmt < 0 ? 'Short (under-collected)' : 'Over (excess collected)'}
              </span>
              <span>
                {Math.abs(discrepancyAmt) < 0.01 ? '₹0.00' : `₹${fmt(Math.abs(discrepancyAmt))}`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
