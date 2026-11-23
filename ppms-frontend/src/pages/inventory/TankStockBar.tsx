import { AlertTriangle, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatNumberIn } from '../../i18n/format'
import type { TankStock } from '../../api/inventoryApi'
import { FUEL_COLORS } from './inventoryFormat'
import { codeLabel } from '../../constants/labels'
import { StatusBadge } from '../../components/StatusBadge'
import { LitresText } from '../../components/AmountText'

export function TankStockBar({
  tank,
  dipOverdue,
  lastDipAt,
  now,
  onDipCheck,
  onViewLots,
}: {
  tank: TankStock
  dipOverdue: boolean
  lastDipAt: Date | undefined
  now: number
  onDipCheck?: () => void
  onViewLots: () => void
}) {
  const { t } = useTranslation('inventory')
  const pct  = Math.min(100, Math.max(0, tank.stockPercentage))
  const cols = FUEL_COLORS[tank.fuelType] ?? FUEL_COLORS.PETROL
  const isLow = tank.lowStock

  function timeSinceDip(d: Date) {
    const diffMs = now - d.getTime()
    const h = Math.floor(diffMs / (1000 * 60 * 60))
    if (h < 24) return t('tank.hoursAgo', { value: h })
    return t('tank.daysAgo', { value: Math.floor(h / 24) })
  }

  return (
    <article
      aria-label={t('tank.cardLabel', { tank: tank.tankIdentifier, fuel: codeLabel(tank.fuelType) })}
      className={`ui-card-plain flex h-full flex-col gap-3 p-(--density-card-pad) ${dipOverdue ? 'border-bad' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-badge ${cols.badge}`}>
            {codeLabel(tank.fuelType)}
          </span>
          <span className="truncate text-sm font-semibold text-ink">{tank.tankIdentifier}</span>
        </div>
        <span className={`text-sm font-semibold tabular-nums ${isLow ? 'text-bad' : 'text-ink-2'}`}>
          {pct.toFixed(1)}%
        </span>
      </div>

      {(isLow || dipOverdue) && (
        <div className="flex flex-wrap gap-1.5">
          {isLow && (
            <StatusBadge tone="bad" icon={AlertTriangle} label={t('tank.lowStock')} className="animate-pulse" />
          )}
          {dipOverdue && (
            <StatusBadge
              tone="bad"
              icon={Clock}
              label={lastDipAt ? t('tank.dipOverdueLast', { ago: timeSinceDip(lastDipAt) }) : t('tank.dipOverdueNever')}
            />
          )}
        </div>
      )}

      <div>
        <div className="w-full h-4 bg-surface-sunken rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isLow ? 'bg-bad animate-pulse' : cols.bar
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 mt-1.5 text-xs text-ink-3">
          <span>
            <LitresText value={tank.currentStock} className={`font-semibold ${isLow ? 'text-bad' : 'text-ink'}`} />
            {' '}{t('tank.remaining')}
          </span>
          <span>{t('tank.capacity', { value: formatNumberIn(tank.capacity, { minimumFractionDigits: 0 }) })}</span>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onViewLots}
          className="ui-btn ui-btn-secondary ui-btn-compact"
        >
          {t('tank.viewLots')}
        </button>
        {onDipCheck && (
          <button
            type="button"
            onClick={onDipCheck}
            className="ui-btn ui-btn-secondary ui-btn-compact"
          >
            {t('tank.dipCheck')}
          </button>
        )}
      </div>
    </article>
  )
}
