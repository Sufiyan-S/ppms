

export function CalibrationReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="font-medium text-sm text-slate-800 text-right">{value}</span>
    </div>
  )
}
