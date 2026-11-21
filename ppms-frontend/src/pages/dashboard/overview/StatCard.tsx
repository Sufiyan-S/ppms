import { type LucideIcon } from 'lucide-react'
import { useCountUp } from '../../../hooks/useCountUp'

// ── Stat card ──────────────────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, color, icon: Icon, alert, format,
}: {
  label: string
  value: number
  sub: string
  color: string
  icon: LucideIcon
  alert?: boolean
  format?: (n: number) => string
}) {
  const animated = useCountUp(value)
  const displayed = format ? format(animated) : String(animated)

  return (
    <div className={`ui-dashboard-stat ${alert ? 'ui-dashboard-stat--alert' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white shadow-sm`}>
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>
      <p className={`text-3xl font-bold tracking-tight tabular-nums ${alert ? 'text-red-600' : 'text-slate-900'}`}>
        {displayed}
      </p>
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{sub}</p>
    </div>
  )
}
