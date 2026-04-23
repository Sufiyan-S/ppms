import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  Fuel, AlertTriangle, Zap, IndianRupee, Gauge,
  Database, Settings, BarChart2, ReceiptText, Landmark,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { pumpApi } from '../../api/pumpApi'
import { shiftApi } from '../../api/shiftApi'
import { inventoryApi } from '../../api/inventoryApi'
import { usePumpStore } from '../../store/usePumpStore'
import { localDateInputValue } from '../../utils/date'
import { SkeletonStat } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { useCountUp } from '../../hooks/useCountUp'
import type { Shift } from '../../types/shift'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

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

  const activeShiftsFetching  = activeShiftQueries.some(q => q.isFetching)
  const activeShiftsUpdatedAt = activeShiftQueries.reduce<number>(
    (max, q) => Math.max(max, q.dataUpdatedAt ?? 0), 0
  )

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const closedShiftCountToday = historyShifts.filter(s => s.shiftDate === todayStr).length

  // ── Revenue chart ────────────────────────────────────────────────────────────
  const [chartDays, setChartDays] = useState<7 | 14 | 30>(7)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())

  const toggleSeries = (key: string) =>
    setHiddenSeries(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const FUEL_CHART_COLORS: Record<string, string> = {
    PETROL:       '#10b981',
    SPEED_PETROL: '#0d9488',
    DIESEL:       '#f59e0b',
    SPEED_DIESEL: '#8b5cf6',
    CNG:          '#ef4444',
  }

  const FUEL_CHART_LABELS: Record<string, string> = {
    PETROL: 'Petrol', SPEED_PETROL: 'Speed Petrol',
    DIESEL: 'Diesel', SPEED_DIESEL: 'Speed Diesel', CNG: 'CNG',
  }

  const { revenueChartData, chartFuelTypes } = useMemo(() => {
    // Collect all fuel types present in the window
    const fuelTypeSet = new Set<string>()
    historyShifts.forEach(s =>
      s.fuelReadings.forEach(fr => { if (fr.unitsSold != null) fuelTypeSet.add(fr.fuelType) })
    )
    const fuelTypes = Array.from(fuelTypeSet)

    const today = new Date()
    const data: Array<Record<string, number | string>> = []
    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${day}`
      const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      const entry: Record<string, number | string> = { label, date: dateStr, revenue: 0 }
      fuelTypes.forEach(ft => { entry[ft] = 0 })
      data.push(entry)
    }
    historyShifts.forEach(s => {
      const entry = data.find(r => r.date === s.shiftDate)
      if (!entry) return
      if (s.totalAmountDue != null) (entry.revenue as number) += s.totalAmountDue
      s.fuelReadings.forEach(fr => {
        if (fr.unitsSold != null && fr.fuelType in entry) {
          (entry[fr.fuelType] as number) += fr.unitsSold
        }
      })
    })
    return { revenueChartData: data, chartFuelTypes: fuelTypes }
  }, [historyShifts, chartDays])

  const hasChartData = revenueChartData.some(d => (d.revenue as number) > 0)

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Welcome header ── */}
      <Reveal delay={60}>
      <div className="ui-dashboard-hero">
        <div className="ui-dashboard-hero-copy">
          <div className="ui-dashboard-chip">
            <Fuel size={11} strokeWidth={2.2} />
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
      </Reveal>

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
      {historyShifts.length > 0 && (
        <Reveal delay={230}>
        <div className="ui-card p-0 overflow-hidden">
          <div className="ui-toolbar">
            <p className="ui-toolbar-title">Revenue Trend</p>
            <div className="ui-chart-days-toggle">
              {([7, 14, 30] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setChartDays(d)}
                  className={`ui-chart-day-btn ${chartDays === d ? 'ui-chart-day-btn--active' : ''}`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {hasChartData ? (
            <div className="ui-chart-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={revenueChartData} margin={{ top: 4, right: 52, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false}
                    interval={chartDays === 30 ? 4 : chartDays === 14 ? 1 : 0}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false}
                    width={62}
                    tickFormatter={v =>
                      v >= 100_000 ? `₹${(v / 100_000).toFixed(1)}L`
                      : v >= 1_000  ? `₹${(v / 1_000).toFixed(0)}k`
                      : `₹${v}`
                    }
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false}
                    width={48}
                    tickFormatter={v => `${v}L`}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: '0.75rem', borderRadius: '0.625rem',
                      border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                      padding: '0.5rem 0.75rem',
                    }}
                    formatter={(v, name) => {
                      const n = typeof v === 'number' ? v : 0
                      if (name === 'revenue') return [`₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, 'Revenue']
                      return [`${n.toFixed(2)} L`, FUEL_CHART_LABELS[name as string] ?? name]
                    }}
                    labelStyle={{ color: '#64748b', marginBottom: '0.25rem' }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '0.7rem', paddingTop: '4px', cursor: 'pointer' }}
                    formatter={(v) => {
                      const label = v === 'revenue' ? 'Revenue' : (FUEL_CHART_LABELS[v] ?? v)
                      const hidden = hiddenSeries.has(v)
                      return (
                        <span style={{ color: hidden ? '#cbd5e1' : undefined, textDecoration: hidden ? 'line-through' : undefined }}>
                          {label}
                        </span>
                      )
                    }}
                    onClick={(e) => toggleSeries(e.dataKey as string)}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#revGrad)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: '#3b82f6' }}
                    hide={hiddenSeries.has('revenue')}
                  />
                  {chartFuelTypes.map(ft => (
                    <Line
                      key={ft}
                      yAxisId="right"
                      type="monotone"
                      dataKey={ft}
                      stroke={FUEL_CHART_COLORS[ft] ?? '#94a3b8'}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0, fill: FUEL_CHART_COLORS[ft] ?? '#94a3b8' }}
                      hide={hiddenSeries.has(ft)}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="ui-empty py-10 text-xs">No closed shift revenue in the last {chartDays} days.</p>
          )}
        </div>
        </Reveal>
      )}

      {/* ── Tank stock summary ── */}
      {allTanks.length > 0 && (
        <Reveal delay={295}>
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
        </Reveal>
      )}

      {/* ── Module navigation cards ── */}
      <Reveal delay={335}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ModuleCard
          to="/dashboard/shifts"
          icon={Zap}
          title="Shifts"
          description="Open / close operator shifts, record meter readings and payment collection."
          color="from-emerald-500 to-emerald-600"
        />
        <ModuleCard
          to="/dashboard/inventory"
          icon={Database}
          title="Inventory"
          description="Log tanker deliveries, track FIFO stock levels, and record DIP checks."
          color="from-blue-500 to-blue-600"
        />
        <ModuleCard
          to="/dashboard/balance-sheets"
          icon={BarChart2}
          title="Balance Sheets"
          description="View daily and shift-level P&L, revenue, COGS, and net profit."
          color="from-violet-500 to-violet-600"
        />
        <ModuleCard
          to="/dashboard/expenses"
          icon={ReceiptText}
          title="Expenses"
          description="Track operational expenses and analyse cost trends by category."
          color="from-orange-500 to-orange-600"
        />
        <ModuleCard
          to="/dashboard/settlements"
          icon={Landmark}
          title="Settlements"
          description="Manage payment settlements and track partial payment collections."
          color="from-teal-500 to-teal-600"
        />
        <ModuleCard
          to="/dashboard/setup"
          icon={Settings}
          title="Setup"
          description="Configure pump locations, nozzles, fuel prices, staff, and credit clients."
          color="from-slate-500 to-slate-600"
        />
      </div>
      </Reveal>
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
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

// ── Live shift board row ───────────────────────────────────────────────────────

function timeOpen(startTime: string): string {
  const mins = Math.floor((Date.now() - new Date(startTime).getTime()) / 60_000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function ShiftStatusRow({ shift }: { shift: Shift }) {
  const isOverdue = shift.status === 'OPEN_OVERDUE'
  const fuels = [...new Set(shift.nozzles.map(n => n.fuelType))].join(' · ')

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isOverdue ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">
            {shift.duName ?? `DU ${shift.duNumber}`}
          </span>
          {fuels && <span className="text-xs text-slate-400">{fuels}</span>}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {shift.operatorName} · {shift.shiftWindow}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-slate-400">{timeOpen(shift.actualStartTime)}</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          isOverdue
            ? 'bg-red-100 text-red-700'
            : 'bg-emerald-100 text-emerald-700'
        }`}>
          {isOverdue ? 'Overdue' : 'Open'}
        </span>
      </div>
    </div>
  )
}

// ── Module navigation card ─────────────────────────────────────────────────────

function ModuleCard({
  to, icon: Icon, title, description, color,
}: {
  to: string
  icon: LucideIcon
  title: string
  description: string
  color: string
}) {
  return (
    <Link to={to}>
      <div className="ui-dashboard-module overflow-hidden transition-all duration-200 border-slate-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
        <div className={`bg-gradient-to-r ${color} px-4 py-3.5 flex items-center gap-3`}>
          <Icon size={18} className="text-white flex-shrink-0" strokeWidth={2} />
          <span className="text-sm font-bold text-white">{title}</span>
        </div>
        <div className="bg-white px-4 py-3.5">
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
            <span>Open module</span>
            <span>→</span>
          </div>
        </div>
      </div>
    </Link>
  )
}
