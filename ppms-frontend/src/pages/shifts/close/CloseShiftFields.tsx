import { Check, ArrowUp } from 'lucide-react'

export function Section({ label, title, optional = false, children }: {
  label: string; title: string; optional?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
          {label}
        </span>
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {optional && <span className="text-xs text-slate-500">(optional)</span>}
      </div>
      {children}
    </div>
  )
}

export function ReadingField({ label, startValue, soldUnits, pricePerUnit, value, onChange, unitLabel, isInvalid, noChange, onNoChangeToggle }: {
  label: string; startValue: number; soldUnits: number; pricePerUnit: number;
  value: string; onChange: (v: string) => void; unitLabel: string; isInvalid?: boolean
  noChange?: boolean; onNoChangeToggle?: () => void
}) {
  const saleValue = soldUnits > 0 ? soldUnits * pricePerUnit : null

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="ui-label mb-0">{label}</span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={noChange ?? false}
            onChange={onNoChangeToggle}
            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span className="text-xs text-slate-500">No change</span>
        </label>
      </div>
      <div className="flex flex-col gap-0.5 text-xs text-slate-500 mb-1">
        <span>Start: <span className="font-medium text-slate-500">{startValue}</span></span>
        {noChange ? (
          <span className="text-slate-500 italic">Reading unchanged — 0 {unitLabel} sold this shift</span>
        ) : (
          <>
            {value !== '' && !isInvalid && soldUnits > 0 && (
              <span className="text-slate-500">
                <span className="font-medium">{value}</span>
                {' − '}
                <span className="font-medium">{startValue}</span>
                {' = '}
                <span className="font-semibold text-emerald-600">{soldUnits.toFixed(3)} {unitLabel}</span>
              </span>
            )}
            {soldUnits > 0 && (
              <span className="text-blue-500 font-medium">
                {soldUnits.toFixed(2)} {unitLabel} × ₹{pricePerUnit}
                {saleValue != null && (
                  <span className="text-emerald-600"> = ₹{saleValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                )}
              </span>
            )}
          </>
        )}
      </div>
      <input aria-label={`${label} end reading`} type="number" step="0.001" min="0" required value={value}
        disabled={noChange}
        onChange={(e) => onChange(e.target.value)}
        className={`text-sm ${
          noChange
            ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed'
            : isInvalid
            ? 'border-red-400 bg-red-50 focus:ring-red-400'
            : 'border-slate-300 focus:ring-blue-500'
        }`}
        placeholder={noChange ? 'Same as opening' : 'Enter end reading'}
      />
      {isInvalid && (
        <p role="alert" className="ui-error-text mt-1">
          End reading cannot be less than start ({startValue}) unless the meter rolled over from its maximum
        </p>
      )}
    </div>
  )
}

export function PaymentField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block">
        <span className="ui-label">{label}</span>
        <input type="number" step="0.01" min="0" value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter amount"
          className="text-sm"
        />
      </label>
    </div>
  )
}

export function BalanceCard({ totalDue, totalCollected, diff, fmt }: {
  totalDue: number; totalCollected: number; diff: number; fmt: (n: number) => string
}) {
  const isBalanced = diff === 0
  const showAsOk   = isBalanced
  return (
    <div className={`rounded-xl border-2 overflow-hidden ${
      showAsOk ? 'border-emerald-300' : diff < 0 ? 'border-red-300' : 'border-amber-300'
    }`}>
      <div className={`px-4 py-3 flex items-center justify-between ${
        showAsOk ? 'bg-emerald-50' : diff < 0 ? 'bg-red-50' : 'bg-amber-50'
      }`}>
        <div className="text-xs text-slate-500 flex gap-6">
          <span>Due: <span className="font-semibold text-slate-700">₹{fmt(totalDue)}</span></span>
          <span>Collected: <span className="font-semibold text-slate-700">₹{fmt(totalCollected)}</span></span>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-bold ${
          showAsOk ? 'text-emerald-700' : diff < 0 ? 'text-red-700' : 'text-amber-700'
        }`}>
          {isBalanced ? (
            <span className="inline-flex items-center gap-1"><Check size={14} strokeWidth={2.5} />Balanced</span>
          ) : diff < 0 ? (
            <span className="inline-flex items-center gap-1"><ArrowUp size={13} strokeWidth={2} style={{ transform: 'rotate(180deg)' }} />SHORT ₹{fmt(Math.abs(diff))}</span>
          ) : (
            <span className="inline-flex items-center gap-1"><ArrowUp size={13} strokeWidth={2} />OVER ₹{fmt(diff)}</span>
          )}
        </div>
      </div>
    </div>
  )
}
