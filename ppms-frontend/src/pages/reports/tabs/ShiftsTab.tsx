import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { reportApi } from '../../../api/reportApi'
import type { ShiftReportLine } from '../../../api/reportApi'
import { Pagination } from '../../../components/Pagination'
import { pageSlice } from '../../../utils/pageSlice'
import { Link } from 'react-router-dom'
import { CsvExportButton } from '../../../components/CsvExportButton'
import { csvFilename } from '../../../utils/csv'
import type { CsvColumn } from '../../../utils/csv'
import { presetRange } from '../../../utils/datePresets'
import type { DateRange } from '../../../utils/datePresets'
import { shiftUrl } from '../../../utils/drillDown'
import { printWhenFontsReady } from '../../../i18n/fonts'
import { useReportRange, yesterdayToTodayRange } from '../useReportRange'
import { DateRangeInputs, EmptyRangeSuggestion, ErrorBox, PrintHeader, ReportFilterBar } from '../shared'
import { PageSection } from '../../../components/layout/PageSection'
import { discrepancyTypeLabel } from '../reportFormat'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { shiftStatusBadge } from '../../../components/statusBadges'
import { MoneyText } from '../../../components/AmountText'
import type { ShiftStatus } from '../../../types/shift'
import { codeLabel } from '../../../constants/labels'

const CSV_COLUMNS: CsvColumn<ShiftReportLine>[] = [
  { header: 'Shift', value: (row) => row.id, kind: 'number' },
  { header: 'Date', value: (row) => row.shiftDate, kind: 'date' },
  { header: 'Window', value: (row) => row.shiftName },
  { header: 'Status', value: (row) => codeLabel(row.status) },
  { header: 'Amount due', value: (row) => row.totalAmountDue, kind: 'money' },
  { header: 'Cash', value: (row) => row.cashCollected, kind: 'money' },
  { header: 'UPI', value: (row) => row.upiCollected, kind: 'money' },
  { header: 'Card', value: (row) => row.cardCollected, kind: 'money' },
  { header: 'Credit', value: (row) => row.creditTotal, kind: 'money' },
  { header: 'Discrepancy type', value: (row) => row.discrepancyType },
  { header: 'Discrepancy amount', value: (row) => row.discrepancyAmount, kind: 'money' },
]

function discrepancyCell(s: ShiftReportLine) {
  if (!s.discrepancyAmount || s.discrepancyAmount <= 0) return <span className="text-ink-3">—</span>
  return (
    <span className={`text-xs font-semibold ${s.discrepancyType === 'SHORT' ? 'text-bad' : 'text-warn'}`}>
      {discrepancyTypeLabel(s.discrepancyType)} <MoneyText value={s.discrepancyAmount} />
    </span>
  )
}

function printColumns(t: TFunction<['reports', 'common']>): DataTableColumn<ShiftReportLine>[] {
  return [
    { key: 'date', header: t('columns.date'), cell: (s) => <span className="text-ink-2">{s.shiftDate}</span> },
    { key: 'window', header: t('columns.window'), cell: (s) => <span className="text-ink-3">{s.shiftName ?? '—'}</span> },
    { key: 'status', header: t('columns.status'), cell: (s) => s.status ? <StatusBadge {...shiftStatusBadge(s.status as ShiftStatus)} /> : '—' },
    { key: 'due', header: t('columns.amountDue'), numeric: true, cell: (s) => <MoneyText value={s.totalAmountDue} className="font-medium text-ink" /> },
    { key: 'cash', header: t('common:paymentMethods.CASH'), numeric: true, cell: (s) => <MoneyText value={s.cashCollected} className="text-ink-2" /> },
    { key: 'upi', header: t('common:paymentMethods.UPI'), numeric: true, cell: (s) => <MoneyText value={s.upiCollected} className="text-ink-2" /> },
    { key: 'card', header: t('common:paymentMethods.CARD'), numeric: true, cell: (s) => <MoneyText value={s.cardCollected} className="text-ink-2" /> },
    { key: 'credit', header: t('common:paymentMethods.CREDIT'), numeric: true, cell: (s) => <MoneyText value={s.creditTotal} tone="warn" /> },
    { key: 'discrepancy', header: t('columns.discrepancy'), numeric: true, cell: discrepancyCell },
  ]
}

function screenColumns(t: TFunction<['reports', 'common']>): DataTableColumn<ShiftReportLine>[] {
  return [
    { key: 'shift', header: t('columns.shift'), cell: (s) => <Link to={shiftUrl(s.id)} className="ui-link">{t('common:shiftNumber', { id: s.id })}</Link> },
    ...printColumns(t),
  ]
}

// ── Shifts Tab ────────────────────────────────────────────────────────────────

export function ShiftsTab({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['reports', 'common'])
  const [query, setQuery, isDefaultRange] = useReportRange(yesterdayToTodayRange)
  const [from, setFrom] = useState(query.from)
  const [to,   setTo]   = useState(query.to)
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<ShiftReportLine[]>({
    queryKey: ['report-shifts', pumpId, query.from, query.to],
    queryFn:  () => reportApi.getShiftsReport(pumpId, query.from, query.to),
  })

  const rows  = data ?? []
  const paged = data ? pageSlice(rows, page, pageSize) : null

  const applyRange = (range: DateRange) => {
    setFrom(range.from)
    setTo(range.to)
    setQuery(range)
    setPage(0)
  }

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
        <CsvExportButton filename={csvFilename('shifts', query)} columns={CSV_COLUMNS} rows={rows} />
      </ReportFilterBar>

      {error && <ErrorBox message={serverMessage(error) ?? t('controls.loadFailed')} />}

      {/* Screen: paginated data */}
      {data && paged && (
        rows.length === 0 ? (
          isDefaultRange
            ? <div className="print:hidden"><EmptyRangeSuggestion message={t('emptyRange.noClosedShifts')} onShowLastMonth={() => applyRange(presetRange('lastMonth'))} /></div>
            : <p className="ui-empty py-4 print:hidden">{t('shifts.none')}</p>
        ) : (
          <PageSection
            title={t('shifts.caption')}
            titleMeta={<span className="text-xs text-ink-3">{t('shifts.inRange', { count: rows.length })}</span>}
            className="print:hidden"
            flush
          >
            <DataTable
              caption={t('shifts.caption')}
              captionHidden
              columns={screenColumns(t)}
              rows={paged.content}
              rowKey={(s) => s.id}
              scroll
              className="rounded-none border-0"
            />
            <div className="px-4">
              <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
            </div>
          </PageSection>

        )
      )}

      {/* Print: full dataset */}
      {data && rows.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title={t('shifts.printTitle')} from={query.from} to={query.to} />
          <DataTable
            caption={t('shifts.printCaption')}
            captionHidden
            columns={printColumns(t)}
            rows={rows}
            rowKey={(s) => s.id}
          />
          <p className="text-xs text-ink-3">{t('shifts.inRange', { count: rows.length })}</p>
        </div>
      )}
    </div>
  )
}
