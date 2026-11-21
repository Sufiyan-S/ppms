import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Fuel, AlertTriangle, Zap, IndianRupee, Gauge } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { pumpApi } from '../../api/pumpApi'
import { shiftApi } from '../../api/shiftApi'
import { inventoryApi } from '../../api/inventoryApi'
import { usePumpStore } from '../../store/usePumpStore'
import { localDateInputValue } from '../../utils/date'
import { SkeletonStat } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { MAX_CHART_DAYS, fmtAmt, isPriceStale } from './overview/overviewFormat'
import { MoneyOverview } from './overview/MoneyOverview'
import { TankStockOverview } from './overview/TankStockOverview'
import { ShiftStatusRow } from './overview/ShiftStatusRow'
import { StatCard } from './overview/StatCard'
import { codeLabel, roleLabel } from '../../constants/labels'

const RevenueTrendChart = lazy(() => import('./overview/RevenueTrendChart').then((module) => ({ default: module.RevenueTrendChart })))

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { user } = useAuthStore()
  const { selectedPumpId } = usePumpStore()

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    staleTime: 5 * 60_000,
  })

  const pumpId = selectedPumpId
  const pumpIds: number[] = pumpId ? [pumpId] : []
  const selectedPump = pumps.find(p => p.id === pumpId)

  // Active shifts for the selected pump
  const activeShiftQueries = useQueries({
    queries: pumpIds.map(id => ({
      queryKey:        ['activeShifts', id] as const,
      queryFn:         () => shiftApi.getActiveShifts(id),
      enabled:         !!id,
      refetchInterval: 60_000,
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
    enabled:  !!pumpId,
  })

  // ── Derived stats ────────────────────────────────────────────────────────────

  const allActiveShifts = activeShiftQueries.flatMap(q => q.data ?? [])
  const activeCount     = allActiveShifts.length

  const allTanks       = tankStockQueries.flatMap(q => q.data ?? [])
  const lowStockTanks  = allTanks.filter(t => t.lowStock)

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

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const closedShiftCountToday = historyShifts.filter(s => s.shiftDate === todayStr).length

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Live data error banner ── */}
      {anyQueryError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          Some live data could not be loaded. Figures shown may be incomplete — refresh to try again.
        </div>
      )}

      {/* ── Welcome header (above the fold, so not faded in) ── */}
      <div className="ui-dashboard-hero">
        <div className="ui-dashboard-hero-copy">
          <div className="ui-dashboard-chip">
            <Fuel size={11} strokeWidth={2.2} />
            <span>Live operations snapshot</span>
          </div>
          <div>
            <p className="ui-dashboard-hero-kicker">{greeting}</p>
            <h1 className="ui-dashboard-hero-title">{user?.fullName}</h1>
            <p className="ui-dashboard-hero-subtitle">
              {roleLabel(user?.role)} · {selectedPump?.name ?? 'No pump selected'}
            </p>
          </div>
        </div>
        <div className="ui-dashboard-hero-meta">
          <div className="ui-dashboard-meta-card">
            <span className="ui-dashboard-meta-label">Pump Focus</span>
            <span className="ui-dashboard-meta-value">{selectedPump?.name ?? 'Select a pump'}</span>
            <span className="ui-dashboard-meta-help">
              {activeCount > 0
                ? `${activeCount} active shift${activeCount !== 1 ? 's' : ''} in progress`
                : 'No active shift at the moment'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Stale fuel price alert ── */}
      {priceIsStale && selectedPump && (
        <Link to="/dashboard/setup" className="block">
        <div className="ui-alert ui-alert-danger flex items-center gap-3 hover:bg-red-100 transition-colors">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">Fuel prices not updated today</p>
              <p className="text-xs text-red-500 mt-0.5 truncate">
                {selectedPump.name} — tap here to update prices in Setup
              </p>
            </div>
            <span className="text-xs text-red-400 font-medium flex-shrink-0">Update →</span>
          </div>
        </Link>
      )}

      {/* ── Live stat cards ── */}
      <Reveal delay={150}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statsLoading ? (
          <>
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </>
        ) : (
          <>
            <StatCard
              label="Active Shifts"
              value={activeCount}
              sub={activeCount === 0 ? 'No open shifts' : `at ${selectedPump?.name ?? 'selected pump'}`}
              color="bg-emerald-500"
              icon={Zap}
            />
            <StatCard
              label="Today's Revenue"
              value={todayRevenue}
              format={fmtAmt}
              sub={`${closedShiftCountToday} closed shift${closedShiftCountToday !== 1 ? 's' : ''} today`}
              color="bg-blue-500"
              icon={IndianRupee}
            />
            <StatCard
              label="Low Stock Tanks"
              value={lowStockTanks.length}
              sub={lowStockTanks.length === 0 ? 'All tanks OK' : 'Need attention'}
              color={lowStockTanks.length > 0 ? 'bg-red-500' : 'bg-slate-400'}
              icon={Gauge}
              alert={lowStockTanks.length > 0}
            />
          </>
        )}
      </div>
      </Reveal>

      {pumpId && <MoneyOverview pumpId={pumpId} />}

      {/* ── Low stock details (shown only when alert) ── */}
      {lowStockTanks.length > 0 && (
        <div className="ui-alert ui-alert-danger">
          <p className="text-xs font-semibold text-red-700 mb-2">Tanks needing a delivery:</p>
          <div className="flex flex-wrap gap-2">
            {lowStockTanks.map(t => (
              <span key={t.tankId}
                className="text-xs bg-white border border-red-200 text-red-700 px-3 py-1 rounded-full font-medium">
                {t.tankIdentifier} ({codeLabel(t.fuelType)}) — {t.stockPercentage.toFixed(1)}% full
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Live shift board ── */}
      {!statsLoading && allActiveShifts.length > 0 && (
        <Reveal delay={195}>
        <div className="ui-card p-0 overflow-hidden">
          <div className="ui-toolbar">
            <div className="flex items-center gap-2.5">
              <p className="ui-toolbar-title">Live Shifts</p>
              <RefreshIndicator isFetching={activeShiftsFetching} dataUpdatedAt={activeShiftsUpdatedAt} />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {allActiveShifts.map(shift => (
              <ShiftStatusRow key={shift.id} shift={shift} />
            ))}
          </div>
        </div>
        </Reveal>
      )}

      {/* ── Revenue trend chart ── */}
      <Suspense fallback={<div className="ui-card h-80" aria-busy="true" aria-label="Loading revenue chart" />}>
        <RevenueTrendChart historyShifts={historyShifts} />
      </Suspense>

      {/* ── Tank stock summary ── */}
      <TankStockOverview tanks={allTanks} />


    </div>
  )
}
