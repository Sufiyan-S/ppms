

// ── Shared small components ───────────────────────────────────────────────────

export function PrintHeader({ title, from, to }: { title: string; from?: string; to?: string }) {
  return (
    <div className="mb-4 border-b border-slate-200 pb-3">
      <h2 className="ui-title-sm">{title}</h2>
      {(from || to) && <p className="ui-help">Period: {from ?? '—'} to {to ?? '—'}</p>}
    </div>
  )
}

export function DateRangeInputs({
  from, to, onFromChange, onToChange,
}: { from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void }) {
  return (
    <div className="ui-filter-group">
      <div>
        <label className="block">
          <span className="ui-label">From</span>
          <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)}
            className="min-w-40 shadow-sm" />
        </label>
      </div>
      <div>
        <label className="block">
          <span className="ui-label">To</span>
          <input type="date" value={to} onChange={(e) => onToChange(e.target.value)}
            className="min-w-40 shadow-sm" />
        </label>
      </div>
    </div>
  )
}

export function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="ui-card ui-card-muted p-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="ui-alert ui-alert-danger text-sm" role="alert">{message}</div>
  )
}
