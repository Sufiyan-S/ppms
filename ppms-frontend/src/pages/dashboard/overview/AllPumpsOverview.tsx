import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronRight, Clock, Gauge, IndianRupee, Zap } from 'lucide-react'
import { pumpApi, type PumpOverviewSummary } from '../../../api/pumpApi'
import { Reveal } from '../../../components/Reveal'
import { SkeletonRows, SkeletonStat } from '../../../components/Skeleton'
import { MoneyText } from '../../../components/AmountText'
import { StatusBadge } from '../../../components/StatusBadge'
import { DashboardColumns, KpiRow } from '../../../components/layout/DashboardGrid'
import { PageSection } from '../../../components/layout/PageSection'
import { usePumpStore } from '../../../store/usePumpStore'
import { StatCard } from './StatCard'

/** Switches the Overview between the selected pump and all pumps; hidden unless the user has two or more pumps. */
export function OverviewScopeToggle({ pumpCount, selectedPumpName, showAllPumps, onShowAllPumpsChange }: {
  pumpCount: number
  selectedPumpName: string | undefined
  showAllPumps: boolean
  onShowAllPumpsChange: (showAllPumps: boolean) => void
}) {
  const { t } = useTranslation(['dashboard', 'common'])
  if (pumpCount < 2) return null

  return (
    <div role="group" aria-label={t('allPumps.scope')} className="ui-dashboard-pump-switcher">
      <button
        type="button"
        onClick={() => onShowAllPumpsChange(true)}
        aria-pressed={showAllPumps}
        className={`ui-dashboard-pump-chip ${showAllPumps ? 'ui-dashboard-pump-chip--active' : ''}`}
      >
        {t('common:pumpScope.allPumps')}
      </button>
      <button
        type="button"
        onClick={() => onShowAllPumpsChange(false)}
        aria-pressed={!showAllPumps}
        className={`ui-dashboard-pump-chip ${showAllPumps ? '' : 'ui-dashboard-pump-chip--active'}`}
      >
        {selectedPumpName ?? t('common:pumpScope.selectedPump')}
      </button>
    </div>
  )
}

function PumpRow({ pump, onSelect }: { pump: PumpOverviewSummary; onSelect: (pumpId: number) => void }) {
  const { t } = useTranslation(['dashboard', 'common'])
  return (
    <button
      type="button"
      onClick={() => onSelect(pump.pumpId)}
      className="ui-record-row w-full text-left cursor-pointer transition-colors hover:bg-bg focus-visible:bg-bg"
    >
      <div className="ui-record-row__main">
        <div className="ui-record-row__title">
          <span className="text-sm font-semibold text-ink">{pump.name}</span>
          {pump.overdueShiftCount > 0 && (
            <StatusBadge tone="warn" icon={Clock} label={t('allPumps.overdueShifts', { count: pump.overdueShiftCount })} />
          )}
          {pump.lowStockTankCount > 0 && (
            <StatusBadge tone="bad" icon={Gauge} label={t('allPumps.lowTanks', { count: pump.lowStockTankCount })} />
          )}
          {pump.fuelPricesStale && (
            <StatusBadge tone="bad" icon={AlertTriangle} label={t('allPumps.pricesNotUpdated')} />
          )}
        </div>
        <div className="ui-record-row__meta">
          <span>{t('allPumps.activeShifts', { count: pump.openShiftCount })}</span>
        </div>
      </div>
      <div className="ui-record-row__actions">
        <MoneyText value={pump.todaySales} className="text-base font-bold text-ink" />
        <ChevronRight size={16} className="text-ink-3" aria-hidden="true" />
      </div>
    </button>
  )
}

/**
 * Today's totals across all of the user's pumps, then the pump list (one row per pump, opening that pump's own overview)
 * beside the attention inbox on desktop.
 */
export function AllPumpsOverview({ onPumpSelected, attention }: { onPumpSelected: () => void; attention?: ReactNode }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const setSelectedPumpId = usePumpStore(state => state.setSelectedPumpId)

  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ['pumpsOverview'],
    queryFn: pumpApi.getPumpsOverview,
    refetchInterval: 60_000,
  })

  const selectPump = (pumpId: number) => {
    setSelectedPumpId(pumpId)
    onPumpSelected()
  }

  if (isError) {
    return (
      <div className="ui-alert ui-alert-warning">
        {t('allPumps.loadError')}
      </div>
    )
  }

  if (isLoading || !overview) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label={t('allPumps.loading')}>
        <div className="ui-kpi-row">
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
          <SkeletonStat />
        </div>
        <div className="ui-card p-0 overflow-hidden">
          <SkeletonRows count={3} />
        </div>
      </div>
    )
  }

  const { totals, pumps } = overview

  return (
    <>
      <Reveal delay={150}>
        <KpiRow label={t('stats.label')}>
          <StatCard
            label={t('stats.activeShifts')}
            value={totals.openShiftCount}
            sub={totals.overdueShiftCount > 0 ? t('stats.shiftsOverdue', { count: totals.overdueShiftCount }) : t('stats.noneOverdue')}
            color="bg-ok"
            icon={Zap}
            alert={totals.overdueShiftCount > 0}
          />
          <StatCard
            label={t('stats.todaysRevenue')}
            value={totals.todaySales}
            money
            sub={t('stats.acrossPumps', { count: pumps.length })}
            color="bg-primary"
            icon={IndianRupee}
          />
          <StatCard
            label={t('stats.lowStockTanks')}
            value={totals.lowStockTankCount}
            sub={totals.lowStockTankCount === 0 ? t('stats.allTanksOk') : t('stats.needAttention')}
            color={totals.lowStockTankCount > 0 ? 'bg-bad' : 'bg-ink-3'}
            icon={Gauge}
            alert={totals.lowStockTankCount > 0}
          />
          <StatCard
            label={t('stats.staleFuelPrices')}
            value={totals.stalePricePumpCount}
            sub={totals.stalePricePumpCount === 0 ? t('stats.allPricesUpdated') : t('stats.pumpsToUpdate')}
            color={totals.stalePricePumpCount > 0 ? 'bg-bad' : 'bg-ink-3'}
            icon={AlertTriangle}
            alert={totals.stalePricePumpCount > 0}
          />
        </KpiRow>
      </Reveal>

      <DashboardColumns>
        {attention}
        <Reveal delay={195}>
          <PageSection title={t('allPumps.pumps')} description={t('allPumps.selectHint')} flush>
            <div className="ui-record-list">
              {pumps.map(pump => (
                <PumpRow key={pump.pumpId} pump={pump} onSelect={selectPump} />
              ))}
            </div>
          </PageSection>
        </Reveal>
      </DashboardColumns>
    </>
  )
}
