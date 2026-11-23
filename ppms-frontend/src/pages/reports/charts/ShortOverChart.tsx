import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { OperatorDiscrepancySummary } from '../../../api/reportApi'
import { CHART_COLORS, CHART_TOOLTIP_STYLE, compactRupees } from '../../../constants/chartColors'
import { fmtAmt } from '../reportFormat'
import { shortOverChartSummary } from './chartSummaries'

/** Short and over amounts stacked per operator; the summary text names the totals for screen readers. */
export function ShortOverChart({ operators }: { operators: OperatorDiscrepancySummary[] }) {
  const { t } = useTranslation('reports')
  const summaryId = useId()
  const data = operators.map((op) => ({ name: op.operatorName, short: op.totalShortAmount, over: op.totalOverAmount }))
  const seriesName = (name: unknown) => (name === 'short' ? t('charts.shortOver.short') : t('charts.shortOver.over'))
  return (
    <figure className="ui-card p-0 overflow-hidden">
      <figcaption className="ui-toolbar">
        <span className="ui-toolbar-title">{t('charts.shortOver.title')}</span>
        <span id={summaryId} className="ui-toolbar-note basis-full">{shortOverChartSummary(operators)}</span>
      </figcaption>
      <div className="ui-chart-wrap" role="img" aria-labelledby={summaryId}>
        <ResponsiveContainer width="100%" height={Math.max(160, operators.length * 36 + 60)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} tickFormatter={compactRupees} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} width={110} />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              formatter={(value, name) => [fmtAmt(typeof value === 'number' ? value : 0), seriesName(name)]}
            />
            <Legend formatter={seriesName} wrapperStyle={{ fontSize: '0.75rem' }} />
            <Bar dataKey="short" stackId="amount" fill={CHART_COLORS.bad} maxBarSize={22} />
            <Bar dataKey="over" stackId="amount" fill={CHART_COLORS.warn} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
