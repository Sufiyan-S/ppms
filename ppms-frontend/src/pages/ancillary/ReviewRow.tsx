

export function ReviewRow({ label, value, highlight = false }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`font-medium text-sm ${highlight ? 'text-blue-700' : 'text-slate-800'}`}>{value ?? '—'}</span>
    </div>
  )
}
