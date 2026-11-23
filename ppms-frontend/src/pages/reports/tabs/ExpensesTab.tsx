import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { reportApi } from '../../../api/reportApi'
import type { ExpenseReportLine } from '../../../api/reportApi'
import { CsvExportButton } from '../../../components/CsvExportButton'
import { Pagination } from '../../../components/Pagination'
import { PeriodChangeNote } from '../../../components/PeriodChangeNote'
import { pageSlice } from '../../../utils/pageSlice'
import { csvFilename } from '../../../utils/csv'
import type { CsvColumn } from '../../../utils/csv'
import { presetRange, previousPeriod } from '../../../utils/datePresets'
import type { DateRange } from '../../../utils/datePresets'
import { printWhenFontsReady } from '../../../i18n/fonts'
import { useReportRange, yesterdayToTodayRange } from '../useReportRange'
import { DateRangeInputs, EmptyRangeSuggestion, ErrorBox, PrintHeader, ReportFilterBar, ReportSummary, SummaryCard } from '../shared'
import { PageSection } from '../../../components/layout/PageSection'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { approvalStatusBadge } from '../../../components/statusBadges'
import { MoneyText } from '../../../components/AmountText'
import type { ExpenseApprovalStatus } from '../../../api/expenseApi'
import { codeLabel } from '../../../constants/labels'

const CSV_COLUMNS: CsvColumn<ExpenseReportLine>[] = [
  { header: 'Date', value: (row) => row.expenseDate, kind: 'date' },
  { header: 'Category', value: (row) => codeLabel(row.category) },
  { header: 'Description', value: (row) => row.description },
  { header: 'Amount', value: (row) => row.amount, kind: 'money' },
  { header: 'Status', value: (row) => codeLabel(row.approvalStatus) },
]

function approvedTotal(rows: ExpenseReportLine[]): number {
  return rows.filter(e => e.approvalStatus === 'APPROVED').reduce((sum, e) => sum + e.amount, 0)
}

// ── Expenses Tab ──────────────────────────────────────────────────────────────

function expenseColumns(t: TFunction<['reports', 'common']>): DataTableColumn<ExpenseReportLine>[] {
  return [
    { key: 'date', header: t('columns.date'), cell: (e) => <span className="text-ink-2">{e.expenseDate}</span> },
    { key: 'category', header: t('columns.category'), cell: (e) => <span className="text-ink-3 text-xs">{codeLabel(e.category)}</span> },
    { key: 'description', header: t('columns.description'), cell: (e) => <span className="text-ink">{e.description}</span> },
    { key: 'amount', header: t('columns.amount'), numeric: true, cell: (e) => <MoneyText value={e.amount} tone="bad" className="font-medium" /> },
    {
      key: 'status', header: t('columns.status'),
      cell: (e) => e.approvalStatus ? <StatusBadge {...approvalStatusBadge(e.approvalStatus as ExpenseApprovalStatus)} /> : '—',
    },
  ]
}

export function ExpensesTab({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['reports', 'common'])
  const [query, setQuery, isDefaultRange] = useReportRange(yesterdayToTodayRange)
  const [from, setFrom] = useState(query.from)
  const [to,   setTo]   = useState(query.to)
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<ExpenseReportLine[]>({
    queryKey: ['report-expenses', pumpId, query.from, query.to],
    queryFn:  () => reportApi.getExpensesReport(pumpId, query.from, query.to),
  })

  const rows  = data ?? []
  const paged = data ? pageSlice(rows, page, pageSize) : null
  const total = approvedTotal(rows)
  const columns = expenseColumns(t)

  const previousRange = previousPeriod(query)
  const { data: previous } = useQuery<ExpenseReportLine[]>({
    queryKey: ['report-expenses', pumpId, previousRange.from, previousRange.to],
    queryFn:  () => reportApi.getExpensesReport(pumpId, previousRange.from, previousRange.to),
    enabled: !!data,
  })

  const applyRange = (range: DateRange) => {
    setFrom(range.from)
    setTo(range.to)
    setQuery(range)
    setPage(0)
  }
  const pendingTotal = rows
    .filter(e => e.approvalStatus === 'PENDING_APPROVAL')
    .reduce((sum, e) => sum + e.amount, 0)

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
          disabled={rows.length === 0}
          className="ui-btn ui-btn-secondary"
        >
          {t('common:actions.printPdf')}
        </button>
        <CsvExportButton filename={csvFilename('expenses', query)} columns={CSV_COLUMNS} rows={rows} />
      </ReportFilterBar>

      {error && <ErrorBox message={serverMessage(error) ?? t('controls.loadFailed')} />}

      {/* Screen: paginated data */}
      {data && paged && (
        rows.length === 0 ? (
          isDefaultRange
            ? <div className="print:hidden"><EmptyRangeSuggestion message={t('emptyRange.noExpenses')} onShowLastMonth={() => applyRange(presetRange('lastMonth'))} /></div>
            : <p className="ui-empty py-4 print:hidden">{t('expenses.none')}</p>
        ) : (
          <div className="flex flex-col gap-(--density-gap) print:hidden">
            <ReportSummary columns={2}>
              <SummaryCard label={t('expenses.approved')} value={<MoneyText value={total} />} color="text-bad"
                note={previous && <PeriodChangeNote current={total} previous={approvedTotal(previous)} higherIsBetter={false} />} />
              <SummaryCard label={t('expenses.pending')} value={<MoneyText value={pendingTotal} />} color="text-warn" />
            </ReportSummary>
            <PageSection
              title={t('expenses.caption')}
              titleMeta={<span className="text-xs text-ink-3">{t('expenses.inRange', { count: rows.length })}</span>}
              flush
            >
              <DataTable caption={t('expenses.caption')} captionHidden columns={columns} rows={paged.content} rowKey={(e) => e.id} scroll className="rounded-none border-0" />
              <div className="px-4">
                <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
              </div>
            </PageSection>
          </div>

        )
      )}

      {/* Print: full dataset */}
      {data && rows.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title={t('expenses.printTitle')} from={query.from} to={query.to} />
          <SummaryCard label={t('expenses.approved')} value={<MoneyText value={total} />} color="text-bad" />
          <SummaryCard label={t('expenses.pending')} value={<MoneyText value={pendingTotal} />} color="text-warn" />
          <DataTable caption={t('expenses.printCaption')} captionHidden columns={columns} rows={rows} rowKey={(e) => e.id} />
          <p className="text-xs text-ink-3">{t('expenses.inRange', { count: rows.length })}</p>
        </div>
      )}
    </div>
  )
}
