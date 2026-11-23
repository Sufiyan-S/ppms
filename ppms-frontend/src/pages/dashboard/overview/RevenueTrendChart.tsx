import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { Shift } from '../../../types/shift'
import { withToggled } from '../../../utils/setToggle'
import { localDateInputValue, formatIstDate } from '../../../utils/date'
import { Reveal } from '../../../components/Reveal'
import { PageSection } from '../../../components/layout/PageSection'
import { FUEL_CHART_COLORS } from '../../../constants/fuel'
import { codeLabel } from '../../../constants/labels'
import { formatNumberIn } from '../../../i18n/format'
import { CHART_COLORS, CHART_TOOLTIP_STYLE, compactRupees } from '../../../constants/chartColors'

export function RevenueTrendChart({ historyShifts }: { historyShifts: Shift[] }) {
  const { t } = useTranslation('dashboard')
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
      <Reveal delay={230}>
      <PageSection
        title={t('chart.title')}
        actions={
          <div className="ui-chart-days-toggle">
            {([7, 14, 30] as const).map(d => (
              <button
                key={d}
                onClick={() => setChartDays(d)}
                aria-pressed={chartDays === d}
                aria-label={t('chart.lastDays', { days: d })}
                className={`ui-chart-day-btn ${chartDays === d ? 'ui-chart-day-btn--active' : ''}`}
              >
                {t('chart.dayButton', { days: d })}
              </button>
            ))}
          </div>
        }
        flush
      >
        {hasChartData ? (
          <>
          <div
            className="ui-chart-wrap"
            role="img"
            aria-label={t('chart.summary', { days: chartDays })}
          >
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={revenueChartData} margin={{ top: 4, right: 52, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CHART_COLORS.primary} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
                  axisLine={false} tickLine={false}
                  interval={chartDays === 30 ? 4 : chartDays === 14 ? 1 : 0}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
                  axisLine={false} tickLine={false}
                  width={62}
                  tickFormatter={compactRupees}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
                  axisLine={false} tickLine={false}
                  width={48}
                  tickFormatter={v => `${v}L`}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v, name) => {
                    const n = typeof v === 'number' ? v : 0
                    if (name === 'revenue') return [`₹${formatNumberIn(n, { maximumFractionDigits: 0 })}`, t('chart.revenue')]
                    return [`${n.toFixed(2)} L`, codeLabel(String(name))]
                  }}
                  labelStyle={{ color: CHART_COLORS.axis, marginBottom: '0.25rem' }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.primary }}
                  hide={hiddenSeries.has('revenue')}
                />
                {chartFuelTypes.map(ft => (
                  <Line
                    key={ft}
                    yAxisId="right"
                    type="monotone"
                    dataKey={ft}
                    stroke={FUEL_CHART_COLORS[ft] ?? CHART_COLORS.axis}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: FUEL_CHART_COLORS[ft] ?? CHART_COLORS.axis }}
                    hide={hiddenSeries.has(ft)}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-4 pb-3 text-xs" aria-label={t('chart.series')}>
            {['revenue', ...chartFuelTypes].map(series => {
              const hidden = hiddenSeries.has(series)
              const color = series === 'revenue' ? CHART_COLORS.primary : (FUEL_CHART_COLORS[series] ?? CHART_COLORS.axis)
              return (
                <button
                  key={series}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => toggleSeries(series)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-control px-1.5 ${hidden ? 'text-ink-3 line-through' : 'text-ink'}`}
                >
                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: hidden ? CHART_COLORS.grid : color }} />
                  {series === 'revenue' ? t('chart.revenue') : codeLabel(series)}
                </button>
              )
            })}
          </div>
          </>
        ) : (
          <p role="status" className="ui-empty py-10 text-xs">
            {t('chart.empty', { days: chartDays })}
          </p>
        )}
      </PageSection>
      </Reveal>
  )
}
