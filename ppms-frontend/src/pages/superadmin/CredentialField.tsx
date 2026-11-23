

export function CredentialField({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-plain bg-surface border-ok px-3 py-2">
      <p className="text-xs text-ok mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-ink font-mono break-all">{value}</p>
    </div>
  )
}
