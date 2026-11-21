import { useState, useMemo } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Shift } from '../../../types/shift'
import { withToggled } from '../../../utils/setToggle'
import { localDateInputValue, formatIstDate } from '../../../utils/date'
import { Reveal } from '../../../components/Reveal'
import { FUEL_CHART_COLORS, FUEL_LABELS } from '../../../constants/fuel'


export function RevenueTrendChart({ historyShifts }: { historyShifts: Shift[] }) {
  const [chartDays, setChartDays] = useState<7 | 14 | 30>(7)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())

  const toggleSeries = (key: string) =>
    setHiddenSeries(prev => withToggled(prev, key))

  const { revenueChartData, chartFuelTypes } = useMemo(() => {
    // Collect all fuel types present in the window
    const fuelTypeSet = new Set<string>()
    historyShifts.forEach(s =>
      s.fuelReadings.forEach(fr => { if (fr.unitsSold != null) fuelTypeSet.add(fr.fuelType) })
    )
    const fuelTypes = Array.from(fuelTypeSet)

    const data: Array<Record<string, number | string>> = []
    for (let i = chartDays - 1; i >= 0; i--) {
      const dateStr = localDateInputValue(-i)
      const label = formatIstDate(dateStr, { day: 'numeric', month: 'short' })
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
    <>
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
                aria-pressed={chartDays === d}
                aria-label={`Last ${d} days`}
                className={`ui-chart-day-btn ${chartDays === d ? 'ui-chart-day-btn--active' : ''}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        {hasChartData ? (
          <>
          <div
            className="ui-chart-wrap"
            role="img"
            aria-label={`Revenue and fuel quantity trend for the last ${chartDays} days`}
          >
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
                    return [`${n.toFixed(2)} L`, FUEL_LABELS[name as string] ?? name]
                  }}
                  labelStyle={{ color: '#64748b', marginBottom: '0.25rem' }}
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
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-4 pb-3 text-xs" aria-label="Chart series">
            {['revenue', ...chartFuelTypes].map(series => {
              const hidden = hiddenSeries.has(series)
              const color = series === 'revenue' ? '#3b82f6' : (FUEL_CHART_COLORS[series] ?? '#94a3b8')
              return (
                <button
                  key={series}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => toggleSeries(series)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 ${hidden ? 'text-slate-500 line-through' : 'text-slate-700'}`}
                >
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: hidden ? '#cbd5e1' : color }} />
                  {series === 'revenue' ? 'Revenue' : (FUEL_LABELS[series] ?? series)}
                </button>
              )
            })}
          </div>
          </>
        ) : (
          <p className="ui-empty py-10 text-xs">No closed shift revenue in the last {chartDays} days.</p>
        )}
      </div>
      </Reveal>
    )}
    </>
  )
}
