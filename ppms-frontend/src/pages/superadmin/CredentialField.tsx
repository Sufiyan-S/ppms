

export function CredentialField({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-plain bg-white border-green-200 px-3 py-2">
      <p className="text-xs text-green-600 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800 font-mono break-all">{value}</p>
    </div>
  )
}
