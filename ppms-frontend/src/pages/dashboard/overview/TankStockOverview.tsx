import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TankStock } from '../../../api/inventoryApi'
import { Reveal } from '../../../components/Reveal'
import { PageSection } from '../../../components/layout/PageSection'
import { StatusBadge } from '../../../components/StatusBadge'
import { FUEL_STOCK_COLORS } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatNumberIn } from '../../../i18n/format'

export function TankStockOverview({ tanks: allTanks }: { tanks: TankStock[] }) {
  const { t } = useTranslation('dashboard')
  return (
    <>
    {allTanks.length > 0 && (
      <Reveal delay={295}>
      <PageSection
        title={t('tankStock.title')}
        actions={
          <Link to="/dashboard/inventory"
            className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-primary hover:text-primary-strong">
            {t('tankStock.fullInventory')}
          </Link>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {allTanks.map(tank => {
            const pct = Math.min(100, Math.max(0, tank.stockPercentage))
            const barColor = tank.lowStock ? 'bg-bad' : FUEL_STOCK_COLORS[tank.fuelType]?.bar ?? 'bg-control'
            const percent = pct.toFixed(0)

            return (
            <div key={tank.tankId} className="ui-card-plain ui-card-muted px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-ink">{tank.tankIdentifier}</span>
                    <span className="text-xs text-ink-3">{codeLabel(tank.fuelType)}</span>
                    {tank.lowStock && <StatusBadge tone="bad" label={t('tankStock.low')} />}
                  </div>
                  <span className={`text-xs font-medium ${tank.lowStock ? 'text-bad' : 'text-ink-3'}`}>
                    {percent}%
                  </span>
                </div>
                <div
                  className="w-full h-2 bg-surface-sunken rounded-full overflow-hidden"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={t(tank.lowStock ? 'tankStock.progressLow' : 'tankStock.progress', { tank: tank.tankIdentifier, percent })}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${barColor} ${tank.lowStock ? 'animate-pulse' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-ink-3 mt-1">
                  {t('tankStock.remaining', { litres: formatNumberIn(tank.currentStock, { minimumFractionDigits: 0 }) })}
                </p>
              </div>
            )
          })}
        </div>
      </PageSection>
      </Reveal>
    )}
    </>
  )
}
