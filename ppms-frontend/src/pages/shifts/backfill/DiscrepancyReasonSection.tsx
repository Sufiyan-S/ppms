import type { BackfillForm } from './useBackfillForm'

export function DiscrepancyReasonSection({ form }: { form: BackfillForm }) {
  const { discrepancyReason, setDiscrepancyReason } = form
  return (
    <div>
      <label className="block">
        <span className="ui-label">
        Discrepancy Reason
        <span className="text-slate-500 font-normal ml-1 text-xs">(required if collected ≠ expected)</span>
      </span>
        <textarea
          value={discrepancyReason}
          onChange={(e) => setDiscrepancyReason(e.target.value)}
          placeholder="Explain any difference between collected and expected amounts…"
          rows={2}
          className="ui-input resize-none"
        />
      </label>
    </div>
  )
}
