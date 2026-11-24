import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Zap, IndianRupee, Gauge } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { pumpApi } from '../../api/pumpApi'
import { shiftApi } from '../../api/shiftApi'
import { inventoryApi } from '../../api/inventoryApi'
import { usePumpStore } from '../../store/usePumpStore'
import { localDateInputValue } from '../../utils/date'
import { SkeletonStat } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { StatusBadge } from '../../components/StatusBadge'
import { MAX_CHART_DAYS } from './overview/overviewFormat'
import { isPriceStale } from '../../utils/fuelPrices'
import { MoneyOverview } from './overview/MoneyOverview'
import { TankStockOverview } from './overview/TankStockOverview'
import { ShiftStatusRow } from './overview/ShiftStatusRow'
import { StatCard } from './overview/StatCard'
import { AllPumpsOverview, OverviewScopeToggle } from './overview/AllPumpsOverview'
import { ManagerHeader, ManagerQuickActions, OpenShiftsLive } from './overview/ManagerHome'
import { Page } from '../../components/layout/Page'
import { PageSection } from '../../components/layout/PageSection'
import { DashboardColumns, KpiRow } from '../../components/layout/DashboardGrid'
import { AttentionInbox } from './overview/AttentionInbox'
import { OverviewHeader } from './overview/OverviewHeader'
import { codeLabel } from '../../constants/labels'
import { formatDecimal } from '../../utils/format'

const RevenueTrendChart = lazy(() => import('./overview/RevenueTrendChart').then((module) => ({ default: module.RevenueTrendChart })))

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { t } = useTranslation(['dashboard', 'common'])
  const { user } = useAuthStore()
  const { selectedPumpId } = usePumpStore()
  const isManager = user?.role === 'MANAGER'
  // An accountant's home is the inbox alone; shift, tank and cash figures are not theirs to open
  const isAccountant = user?.role === 'ACCOUNTANT'

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    staleTime: 5 * 60_000,
  })

  // "All pumps" stays local to this page; the global store always holds one real pump for the other pages
  const [showAllPumps, setShowAllPumps] = useState(false)
  const allPumpsView = showAllPumps && pumps.length >= 2

  const pumpId = allPumpsView ? null : selectedPumpId
  const pumpIds: number[] = pumpId && !isAccountant ? [pumpId] : []
  const selectedPump = pumps.find(p => p.id === selectedPumpId)
  const focusName = allPumpsView ? t('common:pumpScope.allPumps') : selectedPump?.name

  // Active shifts for the selected pump
  const activeShiftQueries = useQueries({
    queries: pumpIds.map(id => ({
      queryKey:        ['activeShifts', id] as const,
      queryFn:         () => shiftApi.getActiveShifts(id),
      enabled:         !!id,
      refetchInterval: isManager ? 15_000 : 60_000,
      refetchIntervalInBackground: false,
    })),
  })

  // Tank stock for the selected pump
  const tankStockQueries = useQueries({
    queries: pumpIds.map(id => ({
      queryKey: ['tankStocks', id] as const,
      queryFn:  () => inventoryApi.getTankStocks(id),
      enabled:  !!id,
    })),
  })

  // Fuel prices for the selected pump
  const fuelPriceQueries = useQueries({
    queries: pumpIds.map(id => ({
      queryKey: ['fuelPrices', id] as const,
      queryFn:  () => pumpApi.getCurrentPrices(id),
      enabled:  !!id,
    })),
  })

  // Shift history for today's revenue
  const chartFrom = localDateInputValue(-(MAX_CHART_DAYS - 1))
  const { data: historyShifts = [] } = useQuery({
    queryKey: ['shiftHistory', pumpId, 'overview', chartFrom],
    queryFn:  () => shiftApi.getShiftHistory(pumpId!, { from: chartFrom }),
    enabled:  !!pumpId && !isAccountant,
  })

  // ── Derived stats ────────────────────────────────────────────────────────────

  const allActiveShifts = activeShiftQueries.flatMap(q => q.data ?? [])
  const activeCount     = allActiveShifts.length

  const allTanks       = tankStockQueries.flatMap(q => q.data ?? [])
  const lowStockTanks  = allTanks.filter(tank => tank.lowStock)

  const todayStr = localDateInputValue()
  const todayRevenue = historyShifts
    .filter(s => s.shiftDate === todayStr && s.totalAmountDue != null)
    .reduce((sum, s) => sum + (s.totalAmountDue ?? 0), 0)

  // Check if fuel prices are stale for the selected pump
  const priceIsStale = fuelPriceQueries[0] && isPriceStale(fuelPriceQueries[0].data ?? [])

  const statsLoading = activeShiftQueries.some(q => q.isLoading)
    || tankStockQueries.some(q => q.isLoading)

  const anyQueryError = activeShiftQueries.some(q => q.isError)
    || tankStockQueries.some(q => q.isError)
    || fuelPriceQueries.some(q => q.isError)

  const activeShiftsFetching  = activeShiftQueries.some(q => q.isFetching)
  const activeShiftsUpdatedAt = activeShiftQueries.reduce<number>(
    (max, q) => Math.max(max, q.dataUpdatedAt ?? 0), 0
  )

  const closedShiftCountToday = historyShifts.filter(s => s.shiftDate === todayStr).length

  const liveShifts = isManager ? (
    !statsLoading && <OpenShiftsLive shifts={allActiveShifts} isFetching={activeShiftsFetching} dataUpdatedAt={activeShiftsUpdatedAt} />
  ) : (
    !statsLoading && allActiveShifts.length > 0 && (
      <Reveal delay={195}>
        <PageSection
          title={t('overview.liveShifts')}
          titleMeta={<RefreshIndicator isFetching={activeShiftsFetching} dataUpdatedAt={activeShiftsUpdatedAt} />}
          flush
        >
          <div className="divide-y divide-border">
            {allActiveShifts.map(shift => (
              <ShiftStatusRow key={shift.id} shift={shift} />
            ))}
          </div>
        </PageSection>
      </Reveal>
    )
  )

  return (
    <Page>
      {isManager ? (
        <>
          <ManagerHeader pumpName={selectedPump?.name} />
          {pumpId && <ManagerQuickActions pumpId={pumpId} activeShifts={allActiveShifts} tanks={allTanks} />}
        </>
      ) : (
        <OverviewHeader focusName={focusName}>
          <OverviewScopeToggle
            pumpCount={pumps.length}
            selectedPumpName={selectedPump?.name}
            showAllPumps={allPumpsView}
            onShowAllPumpsChange={setShowAllPumps}
          />
        </OverviewHeader>
      )}

      {/* ── Live data error banner ── */}
      {anyQueryError && (
        <div className="flex items-center gap-2 rounded-control border border-warn bg-warn-bg px-4 py-2.5 text-xs text-warn">
          <AlertTriangle size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          {t('overview.loadError')}
        </div>
      )}

      {isAccountant ? (
        <AttentionInbox pumpId={pumpId} allPumps={allPumpsView} />
      ) : allPumpsView ? (
        <AllPumpsOverview
          onPumpSelected={() => setShowAllPumps(false)}
          attention={<AttentionInbox pumpId={null} allPumps />}
        />
      ) : (
        <>
          {/* ── Stale fuel price alert ── */}
          {isManager && priceIsStale && selectedPump && (
            <Link to="/dashboard/setup" className="block">
            <div className="ui-alert ui-alert-danger flex items-center gap-3 hover:bg-bad-bg transition-colors">
                <AlertTriangle size={18} className="text-bad flex-shrink-0" strokeWidth={2} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-bad">{t('overview.stalePrices.title')}</p>
                  <p className="text-xs text-bad mt-0.5 truncate">
                    {t('overview.stalePrices.body', { pump: selectedPump.name })}
                  </p>
                </div>
                <span className="text-xs text-bad font-medium flex-shrink-0">{t('overview.stalePrices.action')}</span>
              </div>
            </Link>
          )}

          {/* ── Live stat cards ── */}
          <Reveal delay={150}>
            <KpiRow label={t('stats.label')} columns={3}>
              {statsLoading ? (
                <>
                  <SkeletonStat />
                  <SkeletonStat />
                  <SkeletonStat />
                </>
              ) : (
                <>
                  <StatCard
                    label={t('stats.activeShifts')}
                    value={activeCount}
                    sub={activeCount === 0 ? t('stats.noOpenShifts') : t('stats.atPump', { pump: selectedPump?.name ?? t('stats.selectedPump') })}
                    color="bg-ok"
                    icon={Zap}
                    to="/dashboard/shifts"
                  />
                  <StatCard
                    label={t('stats.todaysRevenue')}
                    value={todayRevenue}
                    money
                    sub={t('stats.closedToday', { count: closedShiftCountToday })}
                    color="bg-primary"
                    icon={IndianRupee}
                    to="/dashboard/shifts?history=all"
                  />
                  <StatCard
                    label={t('stats.lowStockTanks')}
                    value={lowStockTanks.length}
                    sub={lowStockTanks.length === 0 ? t('stats.allTanksOk') : t('stats.needAttention')}
                    color={lowStockTanks.length > 0 ? 'bg-bad' : 'bg-ink-3'}
                    icon={Gauge}
                    alert={lowStockTanks.length > 0}
                    to="/dashboard/inventory"
                  />
                </>
              )}
            </KpiRow>
          </Reveal>

          {pumpId && <MoneyOverview pumpId={pumpId} />}

          {/* ── Attention inbox beside the live shift board ── */}
          <DashboardColumns>
            {!isManager && <AttentionInbox pumpId={pumpId} allPumps={false} />}
            {liveShifts}
          </DashboardColumns>

          {/* ── Low stock details (shown only when alert) ── */}
          {lowStockTanks.length > 0 && (
            <div className="ui-alert ui-alert-danger">
              <p className="text-xs font-semibold text-bad mb-2">{t('overview.lowStock.title')}</p>
              <div className="flex flex-wrap gap-2">
                {lowStockTanks.map(tank => (
                  <StatusBadge key={tank.tankId} tone="bad" icon={Gauge}
                    label={t('overview.lowStock.tank', { tank: tank.tankIdentifier, fuel: codeLabel(tank.fuelType), percent: formatDecimal(tank.stockPercentage, 1) })} />
                ))}
              </div>
            </div>
          )}

          {/* ── Revenue trend beside tank stock ── */}
          <DashboardColumns>
            <Suspense fallback={<div className="ui-card h-80" aria-busy="true" aria-label={t('overview.loadingChart')} />}>
              <RevenueTrendChart historyShifts={historyShifts} />
            </Suspense>
            <TankStockOverview tanks={allTanks} />
          </DashboardColumns>
        </>
      )}
    </Page>
  )
}
