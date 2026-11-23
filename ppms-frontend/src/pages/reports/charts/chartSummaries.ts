import type { OperatorDiscrepancySummary, ProfitLossDayLine } from '../../../api/reportApi'
import i18n from '../../../i18n'
import { fmtAmt, fmtShortDayMonth } from '../reportFormat'

export function profitLossChartSummary(days: ProfitLossDayLine[]): string {
  if (days.length === 0) return i18n.t('reports:charts.pl.empty')
  const revenue = days.reduce((sum, day) => sum + day.revenue, 0)
  const profit = days.reduce((sum, day) => sum + day.grossProfit, 0)
  const best = days.reduce((top, day) => (day.revenue > top.revenue ? day : top))
  const lossDays = days.filter((day) => day.grossProfit < 0).length
  return [
    i18n.t('reports:charts.pl.totals', { revenue: fmtAmt(revenue), profit: fmtAmt(profit), count: days.length }),
    i18n.t('reports:charts.pl.best', { date: fmtShortDayMonth(best.date), amount: fmtAmt(best.revenue) }),
    ...(lossDays > 0 ? [i18n.t('reports:charts.pl.lossDays', { count: lossDays })] : []),
  ].join(' ')
}

export function shortOverChartSummary(operators: OperatorDiscrepancySummary[]): string {
  if (operators.length === 0) return i18n.t('reports:charts.shortOver.empty')
  const short = operators.reduce((sum, op) => sum + op.totalShortAmount, 0)
  const over = operators.reduce((sum, op) => sum + op.totalOverAmount, 0)
  const mostShort = operators.reduce((top, op) => (op.totalShortAmount > top.totalShortAmount ? op : top))
  return [
    i18n.t('reports:charts.shortOver.totals', { short: fmtAmt(short), over: fmtAmt(over), count: operators.length }),
    ...(mostShort.totalShortAmount > 0
      ? [i18n.t('reports:charts.shortOver.mostShort', { name: mostShort.operatorName, amount: fmtAmt(mostShort.totalShortAmount) })]
      : []),
  ].join(' ')
}
