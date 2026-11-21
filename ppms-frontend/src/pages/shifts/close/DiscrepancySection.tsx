import { ArrowUp } from 'lucide-react'
import { fmt } from '../components/creditRow'

interface Props {
  diff: number
  canRoundOff: boolean
  onRoundOff: () => void
  reason: string
  onReasonChange: (reason: string) => void
}

export function DiscrepancySection({ diff, canRoundOff, onRoundOff, reason, onReasonChange }: Props) {
  return (
    <div className={`border-2 rounded-xl overflow-hidden ${diff < 0 ? 'border-red-300' : 'border-amber-300'}`}>
      <div className={`px-4 py-3 flex items-start justify-between gap-3 ${diff < 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
        <div className="flex items-start gap-3">
          <div className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${diff < 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
            !
          </div>
          <div>
            <p className={`text-sm font-semibold ${diff < 0 ? 'text-red-700' : 'text-amber-700'}`}>
              {diff < 0 ? `Shift is SHORT by ₹${fmt(Math.abs(diff))}` : `Shift has EXCESS of ₹${fmt(diff)}`}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {diff < 0 ? 'The operator collected less than the amount due.' : 'The operator collected more than the amount due.'}
              {' '}{canRoundOff ? 'Round it off into cash, or add a reason below.' : 'Add a reason below to close this shift.'}
            </p>
          </div>
        </div>
        {canRoundOff && (
          <button
            type="button"
            onClick={onRoundOff}
            className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
            title={`Adjust cash by ₹${fmt(Math.abs(diff))} so the shift balances`}
          >
            Round off ₹{fmt(Math.abs(diff))} into cash
          </button>
        )}
      </div>
      <div className="px-4 py-3 bg-white">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-600 mb-1.5">
          Reason <span className="text-red-500">*</span>
          <span className="text-slate-500 font-normal ml-1">(required to close)</span>
        </span>
          <textarea value={reason} onChange={(e) => onReasonChange(e.target.value)}
            rows={2}
            placeholder="e.g. Customer paid partial — balance pending, meter error, etc."
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${
              reason.trim().length > 0 ? 'border-emerald-300 focus:ring-emerald-400' : 'border-slate-300 focus:ring-amber-400'
            }`}
          />
        </label>
        {reason.trim().length === 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-amber-600 mt-1"><ArrowUp size={11} strokeWidth={2} />Enter a reason to enable closing</p>
        )}
      </div>
    </div>
  )
}
