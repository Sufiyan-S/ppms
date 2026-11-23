import { Link } from 'react-router-dom'
import { type LucideIcon } from 'lucide-react'
import { useCountUp } from '../../../hooks/useCountUp'
import { MoneyText } from '../../../components/AmountText'

// ── Stat card ──────────────────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, color, icon: Icon, alert, money = false, to,
}: {
  label: string
  value: number
  sub: string
  color: string
  icon: LucideIcon
  alert?: boolean
  /** Shows the value as rupees. */
  money?: boolean
  /** Page with the records behind the figure; the whole card becomes a link to it. */
  to?: string
}) {
  const animated = useCountUp(value)
  const className = `ui-dashboard-stat ${alert ? 'ui-dashboard-stat--alert' : ''} ${to ? 'block transition-shadow hover:shadow-raised' : ''}`

  const content = (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-ink-3 uppercase tracking-wide">{label}</span>
        <div className={`w-10 h-10 ${color} rounded-card flex items-center justify-center text-surface`}>
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>
      <p className={`text-3xl font-bold tracking-tight tabular-nums ${alert ? 'text-bad' : 'text-ink'}`}>
        {money ? <MoneyText value={animated} /> : animated}
      </p>
      <p className="text-xs text-ink-3 mt-1.5 leading-relaxed">{sub}</p>
    </>
  )

  return to
    ? <Link to={to} className={className}>{content}</Link>
    : <div className={className}>{content}</div>
}
