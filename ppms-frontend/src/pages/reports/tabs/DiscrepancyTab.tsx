import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { reportApi } from '../../../api/reportApi'
import type { DiscrepancyLine, OperatorDiscrepancyReport } from '../../../api/reportApi'
import { CsvExportButton } from '../../../components/CsvExportButton'
import { Pagination } from '../../../components/Pagination'
import { PeriodChangeNote } from '../../../components/PeriodChangeNote'
import { pageSlice } from '../../../utils/pageSlice'
import { csvFilename } from '../../../utils/csv'
import type { CsvColumn } from '../../../utils/csv'
import { presetRange, previousPeriod } from '../../../utils/datePresets'
import type { DateRange } from '../../../utils/datePresets'
import { discrepanciesUrl, shiftUrl } from '../../../utils/drillDown'
import { printWhenFontsReady } from '../../../i18n/fonts'
import { useReportRange, yesterdayToTodayRange } from '../useReportRange'
import { DateRangeInputs, EmptyRangeSuggestion, ErrorBox, PrintHeader, ReportFilterBar, ReportSummary, SummaryCard } from '../shared'
import { PageSection } from '../../../components/layout/PageSection'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { discrepancyBadge, shiftStatusBadge } from '../../../components/statusBadges'
import { MoneyText } from '../../../components/AmountText'
import type { DiscrepancyType, ShiftStatus } from '../../../types/shift'
import { codeLabel } from '../../../constants/labels'
import { ShortOverChart } from '../charts/ShortOverChart'

function printColumns(t: TFunction<['reports', 'common']>): DataTableColumn<DiscrepancyLine>[] {
  return [
    { key: 'date', header: t('columns.date'), cell: (s) => <span className="text-ink-2">{s.shiftDate}</span> },
    { key: 'type', header: t('columns.type'), cell: (s) => <StatusBadge {...discrepancyBadge(s.discrepancyType as DiscrepancyType)} /> },
    { key: 'amount', header: t('columns.amount'), numeric: true, cell: (s) => <MoneyText value={s.discrepancyAmount} className="font-semibold text-ink" /> },
    { key: 'status', header: t('columns.status'), cell: (s) => <StatusBadge {...shiftStatusBadge(s.status as ShiftStatus)} /> },
    { key: 'resolution', header: t('columns.resolution'), cell: (s) => <span className="text-ink-3">{codeLabel(s.resolution)}</span> },
  ]
}

function screenColumns(t: TFunction<['reports', 'common']>): DataTableColumn<DiscrepancyLine>[] {
  return [
    { key: 'shift', header: t('columns.shift'), cell: (s) => <Link to={shiftUrl(s.shiftId)} className="ui-link">{t('common:shiftNumber', { id: s.shiftId })}</Link> },
    ...printColumns(t),
  ]
}

type DiscrepancyCsvRow = DiscrepancyLine & { operatorName: string }

const CSV_COLUMNS: CsvColumn<DiscrepancyCsvRow>[] = [
  { header: 'Operator', value: (row) => row.operatorName },
  { header: 'Shift', value: (row) => row.shiftId, kind: 'number' },
  { header: 'Date', value: (row) => row.shiftDate, kind: 'date' },
  { header: 'Type', value: (row) => row.discrepancyType },
  { header: 'Amount', value: (row) => row.discrepancyAmount, kind: 'money' },
  { header: 'Status', value: (row) => codeLabel(row.status) },
  { header: 'Resolution', value: (row) => codeLabel(row.resolution) },
  { header: 'Reason', value: (row) => row.discrepancyReason },
]

function totals(report: OperatorDiscrepancyReport) {
  return {
    short: report.operators.reduce((sum, op) => sum + op.totalShortAmount, 0),
    over: report.operators.reduce((sum, op) => sum + op.totalOverAmount, 0),
  }
}

// ── Short / Over Discrepancy Tab ──────────────────────────────────────────────

export function DiscrepancyTab({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['reports', 'common'])
  const [query, setQuery, isDefaultRange] = useReportRange(yesterdayToTodayRange)
  const [from, setFrom] = useState(query.from)
  const [to,   setTo]   = useState(query.to)
  const [expandedOp, setExpandedOp] = useState<number | null>(null)

  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<OperatorDiscrepancyReport>({
    queryKey: ['report-discrepancy', pumpId, query.from, query.to],
    queryFn: () => reportApi.getOperatorDiscrepancy(pumpId, query.from, query.to),
  })

  const paged = data ? pageSlice(data.operators, page, pageSize) : null

  const previousRange = previousPeriod(query)
  const { data: previous } = useQuery<OperatorDiscrepancyReport>({
    queryKey: ['report-discrepancy', pumpId, previousRange.from, previousRange.to],
    queryFn: () => reportApi.getOperatorDiscrepancy(pumpId, previousRange.from, previousRange.to),
    enabled: !!data,
  })

  const applyRange = (range: DateRange) => {
    setFrom(range.from)
    setTo(range.to)
    setQuery(range)
    setPage(0)
  }

  const csvRows: DiscrepancyCsvRow[] = data
    ? data.operators.flatMap((op) => op.shifts.map((line) => ({ ...line, operatorName: op.operatorName })))
    : []
  const current = data ? totals(data) : null
  const before = previous ? totals(previous) : null
  const showEmptySuggestion = !!data && isDefaultRange && data.operators.length === 0

  return (
    <div className="flex flex-col gap-(--density-gap)">
      <ReportFilterBar>
        <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} onPreset={applyRange} />
        <button
          onClick={() => { setQuery({ from, to }); setPage(0) }}
          disabled={isFetching}
          className="ui-btn ui-btn-primary"
        >
          {isFetching ? t('common:loading.short') : t('common:actions.generate')}
        </button>
        <button
          onClick={() => { void printWhenFontsReady() }}
          disabled={!data || data.operators.length === 0}
          className="ui-btn ui-btn-secondary"
        >
          {t('common:actions.printPdf')}
        </button>
        <CsvExportButton filename={csvFilename('short-over', query)} columns={CSV_COLUMNS} rows={csvRows} />
      </ReportFilterBar>

      {error && <ErrorBox message={serverMessage(error) ?? t('controls.loadFailed')} />}

      {showEmptySuggestion && (
        <div className="print:hidden">
          <EmptyRangeSuggestion message={t('emptyRange.noShortOver')} onShowLastMonth={() => applyRange(presetRange('lastMonth'))} />
        </div>
      )}

      {data && paged && current && !showEmptySuggestion && (
        <div className="flex flex-col gap-(--density-gap) print:hidden">
          <ReportSummary columns={2}>
            <SummaryCard
              label={t('discrepancy.totalShort')}
              value={<MoneyText value={current.short} />}
              color="text-bad"
              note={<>
                {before && <PeriodChangeNote current={current.short} previous={before.short} higherIsBetter={false} />}
                <Link to={discrepanciesUrl(query, 'SHORT')} className="ui-link mt-1 inline-block text-xs">{t('discrepancy.viewShortShifts')}</Link>
              </>}
            />
            <SummaryCard
              label={t('discrepancy.totalOver')}
              value={<MoneyText value={current.over} />}
              color="text-warn"
              note={<>
                {before && <PeriodChangeNote current={current.over} previous={before.over} higherIsBetter={false} />}
                <Link to={discrepanciesUrl(query, 'OVER')} className="ui-link mt-1 inline-block text-xs">{t('discrepancy.viewOverShifts')}</Link>
              </>}
            />
          </ReportSummary>
          {data.operators.length > 0 && <ShortOverChart operators={data.operators} />}
          <PageSection
            title={t('discrepancy.operatorsTitle')}
            titleMeta={<span className="text-xs text-ink-3">{t('discrepancy.shiftsInRange', { count: data.totalDiscrepancyShifts })}</span>}
            flush
          >
          {paged.content.length === 0 ? (
            <div className="ui-empty m-4 py-6">{t('discrepancy.none')}</div>
          ) : (
            paged.content.map((op) => (
              <div key={op.operatorId} className="border-b border-border">
                <button
                  className="ui-accordion-trigger"
                  onClick={() => setExpandedOp(expandedOp === op.operatorId ? null : op.operatorId)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-ink">{op.operatorName}</span>
                    <span className="text-xs text-ink-3">{t('discrepancy.shiftCount', { value: op.discrepancyShiftCount })}</span>
                    {op.unresolvedCount > 0 && (
                      <StatusBadge tone="bad" icon={AlertTriangle} label={t('discrepancy.unresolved', { value: op.unresolvedCount })} />
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {op.totalShortAmount > 0 && (
                      <span className="text-bad font-semibold">{t('discrepancy.short')} <MoneyText value={op.totalShortAmount} /></span>
                    )}
                    {op.totalOverAmount > 0 && (
                      <span className="text-warn font-semibold">{t('discrepancy.over')} <MoneyText value={op.totalOverAmount} /></span>
                    )}
                    {expandedOp === op.operatorId
                      ? <ChevronUp size={14} strokeWidth={2} className="text-ink-3" />
                      : <ChevronDown size={14} strokeWidth={2} className="text-ink-3" />
                    }
                  </div>
                </button>
                {expandedOp === op.operatorId && (
                  <DataTable
                    caption={t('discrepancy.operatorCaption', { name: op.operatorName })}
                    captionHidden
                    columns={screenColumns(t)}
                    rows={op.shifts}
                    rowKey={(s) => s.shiftId}
                    className="rounded-none border-x-0 border-b-0"
                    tableClassName="text-xs"
                  />
                )}
              </div>
            ))
          )}
          <div className="px-4">
            <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
          </div>
          </PageSection>
        </div>

      )}

      {/* Print: full dataset */}
      {data && data.operators.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title={t('discrepancy.printTitle')} from={query.from} to={query.to} />
          <p className="text-xs text-ink-3 mb-2">
            {t('discrepancy.shiftsInRange', { count: data.totalDiscrepancyShifts })}
          </p>
          {data.operators.map((op) => (
            <div key={op.operatorId} className="mb-4">
              <div className="flex items-center gap-3 mb-1 pb-1 border-b border-border">
                <span className="text-sm font-semibold text-ink">{op.operatorName}</span>
                <span className="text-xs text-ink-3">{t('discrepancy.shiftCount', { value: op.discrepancyShiftCount })}</span>
                {op.totalShortAmount > 0 && <span className="text-xs text-bad font-semibold">{t('discrepancy.short')} <MoneyText value={op.totalShortAmount} /></span>}
                {op.totalOverAmount > 0  && <span className="text-xs text-warn font-semibold">{t('discrepancy.over')} <MoneyText value={op.totalOverAmount} /></span>}
              </div>
              <DataTable caption={t('discrepancy.operatorCaption', { name: op.operatorName })} captionHidden columns={printColumns(t)} rows={op.shifts} rowKey={(s) => s.shiftId} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
