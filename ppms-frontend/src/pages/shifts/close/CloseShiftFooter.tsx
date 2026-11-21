import { Check, AlertTriangle } from 'lucide-react'

interface Props {
  readingsComplete: boolean
  paymentTouched: boolean
  isBalanced: boolean
  reasonFilled: boolean
  isPending: boolean
  onCancel: () => void
}

export function CloseShiftFooter({ readingsComplete, paymentTouched, isBalanced, reasonFilled, isPending, onCancel }: Props) {
  return (
    <div className="ui-modal-footer flex-col-reverse sm:flex-row bg-slate-50/80">
      <button type="button" onClick={onCancel}
        className="ui-btn ui-btn-secondary sm:flex-none">
        Cancel
      </button>
      <div className="sm:flex-1 min-w-0">
        {!readingsComplete || !paymentTouched ? (
          <button type="submit" disabled
            className="ui-btn w-full whitespace-normal bg-slate-100 text-slate-700 border-slate-300 cursor-not-allowed disabled:opacity-100">
            Fill in readings &amp; payment to continue
          </button>
        ) : isBalanced ? (
          <button type="submit" disabled={isPending}
            className="ui-btn w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white">
            {isPending ? 'Closing...' : <span className="inline-flex items-center gap-1.5"><Check size={14} strokeWidth={2.5} />Close Shift — Balanced</span>}
          </button>
        ) : reasonFilled ? (
          <button type="submit" disabled={isPending}
            className="ui-btn w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white">
            {isPending ? 'Closing...' : <span className="inline-flex items-center gap-1.5"><AlertTriangle size={14} strokeWidth={2} />Close with Discrepancy</span>}
          </button>
        ) : (
          <button type="submit" disabled
            className="ui-btn w-full whitespace-normal bg-amber-50 text-amber-900 cursor-not-allowed border-2 border-amber-400 border-dashed disabled:opacity-100">
            Add a reason above to close
          </button>
        )}
      </div>
    </div>
  )
}
