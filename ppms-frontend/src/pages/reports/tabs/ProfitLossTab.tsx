import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { withToggled } from '../../../utils/setToggle'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { reportApi } from '../../../api/reportApi'
import type { LotCostLine, ProfitLossDayLine, ProfitLossFuelLine, ProfitLossReport } from '../../../api/reportApi'
import { CsvExportButton } from '../../../components/CsvExportButton'
import { PeriodChangeNote } from '../../../components/PeriodChangeNote'
import { csvFilename } from '../../../utils/csv'
import type { CsvColumn } from '../../../utils/csv'
import { presetRange, previousPeriod } from '../../../utils/datePresets'
import type { DateRange } from '../../../utils/datePresets'
import { shiftsForFuelUrl } from '../../../utils/drillDown'
import { formatIstDate } from '../../../utils/date'
import { printWhenFontsReady } from '../../../i18n/fonts'
import { useReportRange, yesterdayToTodayRange } from '../useReportRange'
import { DateRangeInputs, EmptyRangeSuggestion, ErrorBox, PrintHeader, ReportFilterBar, ReportSummary, SummaryCard } from '../shared'
import { PageSection } from '../../../components/layout/PageSection'
import { StatusBadge } from '../../../components/StatusBadge'
import { fmtShortDate } from '../reportFormat'
import { ProfitLossDailyChart } from '../charts/ProfitLossDailyChart'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { LitresText, MoneyText } from '../../../components/AmountText'
import { codeLabel } from '../../../constants/labels'

// CSV headers stay in English: the files are shared with accountants.
const FUEL_COLUMNS: CsvColumn<ProfitLossFuelLine>[] = [
  { header: 'Fuel type', value: (row) => codeLabel(row.fuelType) },
  { header: 'Revenue', value: (row) => row.revenue, kind: 'money' },
  { header: 'Cost of goods', value: (row) => row.cogs, kind: 'money' },
  { header: 'Gross profit', value: (row) => row.grossProfit, kind: 'money' },
  { header: 'Margin per litre', value: (row) => row.grossMarginPerLitre, kind: 'money' },
]

const DAY_COLUMNS: CsvColumn<ProfitLossDayLine>[] = [
  { header: 'Date', value: (row) => row.date, kind: 'date' },
  { header: 'Revenue', value: (row) => row.revenue, kind: 'money' },
  { header: 'Cost of goods', value: (row) => row.cogs, kind: 'money' },
  { header: 'Gross profit', value: (row) => row.grossProfit, kind: 'money' },
]

type ReportsT = TFunction<['reports', 'common']>

function rangeLabel(t: ReportsT, range: DateRange): string {
  return t('controls.rangeLabel', { from: formatIstDate(range.from), to: formatIstDate(range.to) })
}

function dayTableColumns(t: ReportsT): DataTableColumn<ProfitLossDayLine>[] {
  return [
    { key: 'date', header: t('columns.date'), cell: (day) => fmtShortDate(day.date) },
    { key: 'revenue', header: t('columns.revenue'), numeric: true, cell: (day) => <MoneyText value={day.revenue} /> },
    { key: 'cogs', header: t('columns.costOfGoods'), numeric: true, cell: (day) => <MoneyText value={day.cogs} /> },
    {
      key: 'profit', header: t('columns.grossProfit'), numeric: true,
      cell: (day) => <MoneyText value={day.grossProfit} tone={day.grossProfit >= 0 ? 'ok' : 'bad'} className="font-medium" />,
    },
  ]
}

function printFuelTableColumns(t: ReportsT): DataTableColumn<ProfitLossFuelLine>[] {
  return [
    { key: 'fuel', header: t('columns.fuelType') },
    { key: 'revenue', header: t('columns.revenue'), numeric: true },
    { key: 'cogs', header: t('columns.cogs'), numeric: true },
    { key: 'profit', header: t('columns.grossProfitTitle'), numeric: true },
    { key: 'margin', header: t('columns.marginPerLitre'), numeric: true },
  ]
}

function fuelTableColumns(t: ReportsT): DataTableColumn<ProfitLossFuelLine>[] {
  return [
    { key: 'expand', header: <span className="sr-only">{t('columns.details')}</span>, className: 'w-6 px-2' },
    ...printFuelTableColumns(t),
    { key: 'shifts', header: <span className="sr-only">{t('columns.shifts')}</span>, align: 'right' },
  ]
}

function lotCostColumns(t: ReportsT): DataTableColumn<LotCostLine>[] {
  return [
    { key: 'reference', header: t('columns.lotRef'), cell: (lot) => <span className="text-ink-2">{lot.tankerReference}</span> },
    { key: 'delivered', header: t('columns.deliveryDate'), cell: (lot) => <span className="text-ink-3">{fmtShortDate(lot.deliveryDate)}</span> },
    { key: 'cost', header: t('columns.costPerLitre'), numeric: true, cell: (lot) => <MoneyText value={lot.costPricePerUnit} className="text-ink-2" /> },
    { key: 'units', header: t('columns.unitsConsumed'), numeric: true, cell: (lot) => <LitresText value={lot.quantityConsumed} className="text-ink-2" /> },
    { key: 'total', header: t('columns.cost'), numeric: true, cell: (lot) => <MoneyText value={lot.lotCost} className="font-medium text-ink" /> },
  ]
}

function LotCostTable({ fuelType, lines }: { fuelType: string; lines: LotCostLine[] }) {
  const { t } = useTranslation(['reports', 'common'])
  return (
    <DataTable
      caption={t('pl.lotsUsedFor', { fuel: codeLabel(fuelType) })}
      captionHidden
      columns={lotCostColumns(t)}
      rows={lines}
      rowKey={(lot) => `${lot.lotId}-${lot.costPricePerUnit}`}
      tableClassName="text-xs"
    />
  )
}

function FuelFigureCells({ row }: { row: ProfitLossFuelLine }) {
  return (
    <>
      <td className="font-medium text-ink">{codeLabel(row.fuelType)}</td>
      <td className="text-right"><MoneyText value={row.revenue} className="text-ink" /></td>
      <td className="text-right"><MoneyText value={row.cogs} tone="bad" /></td>
      <td className="text-right"><MoneyText value={row.grossProfit} tone={row.grossProfit >= 0 ? 'ok' : 'bad'} className="font-semibold" /></td>
      <td className="text-right text-ink-3 text-xs">
        {row.grossMarginPerLitre != null ? <><MoneyText value={row.grossMarginPerLitre} />/L</> : '—'}
      </td>
    </>
  )
}

function RevenueBreakdown({ report, className }: { report: ProfitLossReport; className: string }) {
  const { t } = useTranslation(['reports', 'common'])
  const figures = [
    { key: 'cash', label: t('common:paymentMethods.CASH'), value: report.totalCashRevenue, tone: undefined },
    { key: 'upi', label: t('common:paymentMethods.UPI'), value: report.totalUpiRevenue, tone: undefined },
    { key: 'card', label: t('common:paymentMethods.CARD'), value: report.totalCardRevenue, tone: undefined },
    { key: 'credit', label: t('pl.creditSales'), value: report.totalCreditRevenue, tone: 'warn' as const },
  ]
  return (
    <div className={`grid grid-cols-4 gap-3 ${className}`}>
      {figures.map((figure) => (
        <div key={figure.key}>
          <p className="ui-kpi-label">{figure.label}</p>
          <MoneyText value={figure.value} tone={figure.tone} className={`mt-0.5 block text-sm font-semibold ${figure.tone ? '' : 'text-ink'}`} />
        </div>
      ))}
    </div>
  )
}

// ── P&L Tab ───────────────────────────────────────────────────────────────────

export function ProfitLossTab({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['reports', 'common'])
  const [query, setQuery, isDefaultRange] = useReportRange(yesterdayToTodayRange)
  const [from, setFrom] = useState(query.from)
  const [to,   setTo]   = useState(query.to)
  const [showRevBreakdown, setShowRevBreakdown] = useState(false)
  const [expandedFuelRows, setExpandedFuelRows] = useState<Set<string>>(new Set())

  function toggleFuelRow(fuelType: string) {
    setExpandedFuelRows(prev => withToggled(prev, fuelType))
  }

  const { data, isFetching, error } = useQuery<ProfitLossReport>({
    queryKey: ['report-pl', pumpId, query.from, query.to],
    queryFn: () => reportApi.getProfitLoss(pumpId, query.from, query.to),
  })

  const previousRange = previousPeriod(query)
  const { data: previous } = useQuery<ProfitLossReport>({
    queryKey: ['report-pl', pumpId, previousRange.from, previousRange.to],
    queryFn: () => reportApi.getProfitLoss(pumpId, previousRange.from, previousRange.to),
    enabled: !!data,
  })

  const applyRange = (range: DateRange) => {
    setFrom(range.from)
    setTo(range.to)
    setQuery(range)
  }

  const showEmptySuggestion = !!data && isDefaultRange && data.totalShifts === 0

  return (
    <div className="flex flex-col gap-(--density-gap)">
      <ReportFilterBar>
          <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} onPreset={applyRange} />
          <button
            onClick={() => setQuery({ from, to })}
            disabled={isFetching}
            className="ui-btn ui-btn-primary"
          >
            {isFetching ? t('common:loading.short') : t('common:actions.generate')}
          </button>
          <button
            onClick={() => { void printWhenFontsReady() }}
            disabled={!data || data.byFuelType.length === 0}
            className="ui-btn ui-btn-secondary"
          >
            {t('common:actions.printPdf')}
          </button>
          <CsvExportButton
            filename={csvFilename('pl', query)}
            columns={FUEL_COLUMNS}
            rows={data?.byFuelType ?? []}
          />
      </ReportFilterBar>

      {error && <ErrorBox message={serverMessage(error) ?? t('controls.loadFailed')} />}

      {showEmptySuggestion && (
        <div className="print:hidden">
          <EmptyRangeSuggestion message={t('emptyRange.noClosedShifts')} onShowLastMonth={() => applyRange(presetRange('lastMonth'))} />
        </div>
      )}

      {/* Screen: data */}
      {data && !showEmptySuggestion && (
        <div className="flex flex-col gap-(--density-gap) print:hidden">
          <ReportSummary columns={3}>
            <SummaryCard label={t('pl.totalRevenue')} value={<MoneyText value={data.totalRevenue} />} color="text-ink"
              note={previous && <PeriodChangeNote current={data.totalRevenue} previous={previous.totalRevenue} />} />
            <SummaryCard label={t('pl.costOfGoods')} value={<MoneyText value={data.totalCogs} />}    color="text-bad"
              note={previous && <PeriodChangeNote current={data.totalCogs} previous={previous.totalCogs} higherIsBetter={false} />} />
            <SummaryCard label={t('pl.grossProfit')}  value={<MoneyText value={data.grossProfit} />}  color={data.grossProfit >= 0 ? 'text-ok' : 'text-bad'}
              note={previous && <PeriodChangeNote current={data.grossProfit} previous={previous.grossProfit} />} />
          </ReportSummary>
          {previous && (
            <p className="text-xs text-ink-3">{t('controls.comparedWith', { range: rangeLabel(t, previousRange) })}</p>
          )}

          {data.byDay.length > 0 && (
            <>
              <ProfitLossDailyChart days={data.byDay} />
              <details className="ui-card ui-card-muted p-3">
                <summary className="cursor-pointer text-sm font-medium text-ink">{t('pl.dailyTable')}</summary>
                <div className="mt-3 flex justify-end">
                  <CsvExportButton filename={csvFilename('pl-daily', query)} columns={DAY_COLUMNS} rows={data.byDay} />
                </div>
                <DataTable
                  caption={t('pl.dailyCaption')}
                  captionHidden
                  regionLabel={t('pl.dailyRegion')}
                  columns={dayTableColumns(t)}
                  rows={data.byDay}
                  rowKey={(day) => day.date}
                  scroll
                  className="mt-3"
                />
              </details>
            </>
          )}

          {/* Revenue breakdown toggle */}
          <div className="ui-card ui-card-muted p-3">
            <button
              onClick={() => setShowRevBreakdown(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-strong"
            >
              {showRevBreakdown
                ? <ChevronUp size={14} strokeWidth={2} />
                : <ChevronDown size={14} strokeWidth={2} />}
              {t('pl.revenueBreakdown')}
            </button>
            {showRevBreakdown && <RevenueBreakdown report={data} className="mt-3" />}
          </div>

          <PageSection
            title={t('pl.byFuelCaption')}
            titleMeta={<StatusBadge tone="neutral" label={t('pl.closedShiftsInRange', { count: data.totalShifts })} />}
            description={t('pl.fuelOnlyNote')}
            flush
          >
          <DataTable
            caption={t('pl.byFuelCaption')}
            captionHidden
            columns={fuelTableColumns(t)}
            rows={data.byFuelType}
            rowKey={(row) => row.fuelType}
            className="rounded-none border-0"
            renderRow={(row) => (
              <>
                <tr className="cursor-pointer" onClick={() => toggleFuelRow(row.fuelType)}>
                  <td className="px-2 text-ink-3">
                    <button
                      type="button"
                      aria-expanded={expandedFuelRows.has(row.fuelType)}
                      aria-label={t('pl.showShiftDetails', { fuel: codeLabel(row.fuelType) })}
                      onClick={(e) => { e.stopPropagation(); toggleFuelRow(row.fuelType) }}
                      className="ui-btn-icon"
                    >
                      {expandedFuelRows.has(row.fuelType)
                        ? <ChevronUp size={13} strokeWidth={2} aria-hidden="true" />
                        : <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />}
                    </button>
                  </td>
                  <FuelFigureCells row={row} />
                  <td className="text-right text-xs">
                    <Link
                      to={shiftsForFuelUrl(query, row.fuelType)}
                      className="ui-link"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t('pl.viewFuelShifts', { fuel: codeLabel(row.fuelType), range: rangeLabel(t, query) })}
                    >
                      {t('pl.viewShifts')}
                    </Link>
                  </td>
                </tr>
                {expandedFuelRows.has(row.fuelType) && row.lotCostLines.length > 0 && (
                  <tr className="bg-info-bg">
                    <td />
                    <td colSpan={6} className="pt-1">
                      <LotCostTable fuelType={row.fuelType} lines={row.lotCostLines} />
                    </td>
                  </tr>
                )}
              </>
            )}
          />
          </PageSection>
        </div>
      )}

      {/* Print: full dataset */}
      {data && data.byFuelType.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title={t('pl.printTitle')} from={query.from} to={query.to} />
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label={t('pl.totalRevenue')} value={<MoneyText value={data.totalRevenue} />} color="text-ink" />
            <SummaryCard label={t('pl.costOfGoods')} value={<MoneyText value={data.totalCogs} />}    color="text-bad" />
            <SummaryCard label={t('pl.grossProfit')}  value={<MoneyText value={data.grossProfit} />}  color={data.grossProfit >= 0 ? 'text-ok' : 'text-bad'} />
          </div>
          {/* Revenue breakdown — always expanded in print */}
          <RevenueBreakdown report={data} className="mb-2" />
          <DataTable
            caption={t('pl.byFuelPrintCaption')}
            captionHidden
            columns={printFuelTableColumns(t)}
            rows={data.byFuelType}
            rowKey={(row) => row.fuelType}
            renderRow={(row) => (
              <>
                <tr>
                  <FuelFigureCells row={row} />
                </tr>
                {row.lotCostLines.length > 0 && (
                  <tr>
                    <td colSpan={5} className="pb-2">
                      <LotCostTable fuelType={row.fuelType} lines={row.lotCostLines} />
                    </td>
                  </tr>
                )}
              </>
            )}
          />
          <p className="text-xs text-ink-3 mt-1">
            {t('pl.fuelOnlyNote')}
          </p>
          <p className="text-xs text-ink-3">{t('pl.closedShiftsInRange', { count: data.totalShifts })}</p>
        </div>
      )}
    </div>
  )
}
