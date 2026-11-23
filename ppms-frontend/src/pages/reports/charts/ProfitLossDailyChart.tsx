import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProfitLossDayLine } from '../../../api/reportApi'
import { CHART_COLORS, CHART_TOOLTIP_STYLE, compactRupees } from '../../../constants/chartColors'
import { fmtAmt, fmtShortDayMonth } from '../reportFormat'
import { profitLossChartSummary } from './chartSummaries'

/** Daily revenue bars with the gross profit line; the text summary above it is what screen readers get. */
export function ProfitLossDailyChart({ days }: { days: ProfitLossDayLine[] }) {
  const { t } = useTranslation('reports')
  const summaryId = useId()
  const data = days.map((day) => ({ ...day, label: fmtShortDayMonth(day.date) }))
  const seriesName = (name: unknown) => (name === 'revenue' ? t('charts.pl.revenue') : t('charts.pl.grossProfit'))
  return (
    <figure className="ui-card p-0 overflow-hidden">
      <figcaption className="ui-toolbar">
        <span className="ui-toolbar-title">{t('charts.pl.title')}</span>
        <span id={summaryId} className="ui-toolbar-note basis-full">{profitLossChartSummary(days)}</span>
      </figcaption>
      <div className="ui-chart-wrap" role="img" aria-labelledby={summaryId}>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} minTickGap={12} />
            <YAxis tick={{ fontSize: 12, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} width={62} tickFormatter={compactRupees} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value, name) => [fmtAmt(typeof value === 'number' ? value : 0), seriesName(name)]}
            />
            <Legend formatter={seriesName} wrapperStyle={{ fontSize: '0.75rem' }} />
            <Bar dataKey="revenue" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Line dataKey="grossProfit" type="monotone" stroke={CHART_COLORS.ok} strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
