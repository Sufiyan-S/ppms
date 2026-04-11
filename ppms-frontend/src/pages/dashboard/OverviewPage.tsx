import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { pumpApi } from '../../api/pumpApi'
import { shiftApi } from '../../api/shiftApi'
import { inventoryApi } from '../../api/inventoryApi'
import { usePumpStore } from '../../store/usePumpStore'
import { localDateInputValue } from '../../utils/date'

const todayStr = localDateInputValue()

function isPriceStale(prices: { effectiveFrom: string }[]) {
  return prices.length === 0 || prices.some((p) => p.effectiveFrom < todayStr)
}

function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { user } = useAuthStore()
  const { selectedPumpId } = usePumpStore()

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
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
      refetchInterval: 30_000,
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
  const { data: historyShifts = [] } = useQuery({
    queryKey: ['shiftHistory', pumpId],
    queryFn:  () => shiftApi.getShiftHistory(pumpId!),
    enabled:  !!pumpId,
  })

  // ── Derived stats ────────────────────────────────────────────────────────────

  const allActiveShifts = activeShiftQueries.flatMap(q => q.data ?? [])
  const activeCount     = allActiveShifts.length

  const allTanks       = tankStockQueries.flatMap(q => q.data ?? [])
  const lowStockTanks  = allTanks.filter(t => t.lowStock)

  const todayRevenue = historyShifts
    .filter(s => s.shiftDate === todayStr && s.totalAmountDue != null)
    .reduce((sum, s) => sum + (s.totalAmountDue ?? 0), 0)

  // Check if fuel prices are stale for the selected pump
  const priceIsStale = fuelPriceQueries[0] && isPriceStale(fuelPriceQueries[0].data ?? [])

  const statsLoading = activeShiftQueries.some(q => q.isLoading)
    || tankStockQueries.some(q => q.isLoading)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const closedShiftCountToday = historyShifts.filter(s => s.shiftDate === todayStr).length

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Welcome header ── */}
      <div className="ui-dashboard-hero">
        <div className="ui-dashboard-hero-copy">
          <div className="ui-dashboard-chip">
            <span>⛽</span>
            <span>Live operations snapshot</span>
          </div>
          <div>
            <p className="ui-dashboard-hero-kicker">{greeting}</p>
            <h2 className="ui-dashboard-hero-title">{user?.fullName}</h2>
            <p className="ui-dashboard-hero-subtitle">
              {user?.role} · {selectedPump?.name ?? 'No pump selected'}
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
            <span className="text-red-500 text-xl leading-none flex-shrink-0">⚠️</span>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Active Shifts"
          value={statsLoading ? '…' : String(activeCount)}
          sub={activeCount === 0 ? 'No open shifts' : `at ${selectedPump?.name ?? 'selected pump'}`}
          color="bg-emerald-500"
          icon="⚡"
        />
        <StatCard
          label="Today's Revenue"
          value={statsLoading ? '…' : fmtAmt(todayRevenue)}
          sub={`${closedShiftCountToday} closed shift${closedShiftCountToday !== 1 ? 's' : ''} today`}
          color="bg-blue-500"
          icon="₹"
        />
        <StatCard
          label="Low Stock Tanks"
          value={statsLoading ? '…' : String(lowStockTanks.length)}
          sub={lowStockTanks.length === 0 ? 'All tanks OK' : 'Need attention'}
          color={lowStockTanks.length > 0 ? 'bg-red-500' : 'bg-slate-400'}
          icon="🛢"
          alert={lowStockTanks.length > 0}
        />
      </div>

      {/* ── Low stock details (shown only when alert) ── */}
      {lowStockTanks.length > 0 && (
        <div className="ui-alert ui-alert-danger">
          <p className="text-xs font-semibold text-red-700 mb-2">Tanks needing a delivery:</p>
          <div className="flex flex-wrap gap-2">
            {lowStockTanks.map(t => (
              <span key={t.tankId}
                className="text-xs bg-white border border-red-200 text-red-700 px-3 py-1 rounded-full font-medium">
                {t.tankIdentifier} ({t.fuelType}) — {t.stockPercentage.toFixed(1)}% full
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Tank stock summary ── */}
      {allTanks.length > 0 && (
        <div className="ui-card p-0 overflow-hidden">
          <div className="ui-toolbar">
            <p className="ui-toolbar-title">Tank Stock Overview</p>
            <Link to="/dashboard/inventory"
              className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800">
              Full inventory →
            </Link>
          </div>
          <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allTanks.map(tank => {
              const pct = Math.min(100, Math.max(0, tank.stockPercentage))
              const barColor = tank.lowStock
                ? 'bg-red-500'
                : tank.fuelType === 'PETROL'
                  ? 'bg-emerald-500'
                  : tank.fuelType === 'DIESEL'
                    ? 'bg-blue-500'
                    : 'bg-amber-500'

              return (
              <div key={tank.tankId} className="ui-card-plain ui-card-muted px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-700">{tank.tankIdentifier}</span>
                      <span className="text-xs text-slate-400">{tank.fuelType}</span>
                    </div>
                    <span className={`text-xs font-medium ${tank.lowStock ? 'text-red-600' : 'text-slate-500'}`}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${barColor} ${tank.lowStock ? 'animate-pulse' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {tank.currentStock.toLocaleString('en-IN', { minimumFractionDigits: 0 })} L remaining
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Module navigation cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ModuleCard
          to="/dashboard/shifts"
          icon="⚡"
          title="Shifts"
          description="Open / close operator shifts, record meter readings and payment collection."
          color="from-emerald-500 to-emerald-600"
          active
        />
        <ModuleCard
          to="/dashboard/inventory"
          icon="🛢"
          title="Inventory"
          description="Log tanker deliveries, track FIFO stock levels, and record DIP checks."
          color="from-blue-500 to-blue-600"
          active
        />
        <ModuleCard
          to="/dashboard/setup"
          icon="⚙️"
          title="Setup"
          description="Configure pump locations, nozzles, fuel prices, staff, and credit clients."
          color="from-slate-500 to-slate-600"
          active
        />
      </div>
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, icon, alert,
}: {
  label: string
  value: string
  sub: string
  color: string
  icon: string
  alert?: boolean
}) {
  return (
    <div className={`ui-dashboard-stat ${alert ? 'ui-dashboard-stat--alert' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center text-white text-sm shadow-sm`}>
          {icon}
        </div>
      </div>
      <p className={`text-3xl font-bold tracking-tight ${alert ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{sub}</p>
    </div>
  )
}

// ── Module navigation card ─────────────────────────────────────────────────────

function ModuleCard({
  to, icon, title, description, color, active,
}: {
  to: string
  icon: string
  title: string
  description: string
  color: string
  active?: boolean
}) {
  const inner = (
    <div className={`ui-dashboard-module overflow-hidden transition-all duration-200 ${
      active
        ? 'border-slate-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
        : 'border-slate-100 opacity-50 cursor-not-allowed'
    }`}>
      <div className={`bg-gradient-to-r ${color} px-4 py-3.5 flex items-center gap-3`}>
        <span className="text-xl text-white">{icon}</span>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-white">{title}</span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-white/70">Module</span>
        </div>
        {!active && (
          <span className="ml-auto text-xs text-white/70 bg-white/20 px-2 py-0.5 rounded-full">
            Coming soon
          </span>
        )}
      </div>
      <div className="bg-white px-4 py-3.5">
        <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        {active && (
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
            <span>Open module</span>
            <span>→</span>
          </div>
        )}
      </div>
    </div>
  )

  return active ? <Link to={to}>{inner}</Link> : <div>{inner}</div>
}
