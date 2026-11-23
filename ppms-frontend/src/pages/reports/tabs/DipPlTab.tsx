import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery } from '@tanstack/react-query'
import { reportApi } from '../../../api/reportApi'
import type { DipPlEntry } from '../../../api/reportApi'
import { Pagination } from '../../../components/Pagination'
import { pageSlice } from '../../../utils/pageSlice'
import { printWhenFontsReady } from '../../../i18n/fonts'
import { useReportRange, yesterdayToTodayRange } from '../useReportRange'
import { DateRangeInputs, ErrorBox, PrintHeader, ReportFilterBar, ReportSummary, SummaryCard } from '../shared'
import { PageSection } from '../../../components/layout/PageSection'
import { serverMessage } from '../../../utils/apiError'
import { fmtDateTime, fmtQty } from '../reportFormat'
import { FUEL_BADGE } from '../../../constants/fuel'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import type { StatusTone } from '../../../components/StatusBadge'
import { MoneyText } from '../../../components/AmountText'
import { codeLabel } from '../../../constants/labels'
import { CsvExportButton } from '../../../components/CsvExportButton'
import { csvFilename } from '../../../utils/csv'
import type { CsvColumn } from '../../../utils/csv'
import type { DateRange } from '../../../utils/datePresets'

const CSV_COLUMNS: CsvColumn<DipPlEntry>[] = [
  { header: 'Recorded on', value: (row) => row.recordedAt, kind: 'date' },
  { header: 'Type', value: (row) => (row.type === 'DIP_CHECK' ? 'Dip check' : 'Maintenance') },
  { header: 'Fuel', value: (row) => codeLabel(row.fuelType) },
  { header: 'Litres', value: (row) => row.litres.toFixed(2), kind: 'number' },
  { header: 'Profit or loss', value: (row) => row.monetaryAmount, kind: 'money' },
  { header: 'Notes', value: (row) => row.notes },
]

function signTone(value: number): StatusTone {
  return value > 0 ? 'ok' : value < 0 ? 'bad' : 'neutral'
}

function dipEntryKey(e: DipPlEntry) {
  return `${e.type}-${e.fuelType}-${e.recordedAt}`
}

function dipColumns(t: TFunction<['reports', 'common']>): DataTableColumn<DipPlEntry>[] {
  return [
    { key: 'recordedAt', header: t('columns.dateTime'), cell: (e) => <span className="text-ink-2 text-xs">{fmtDateTime(e.recordedAt)}</span> },
    {
      key: 'type', header: t('columns.type'),
      cell: (e) => e.type === 'DIP_CHECK'
        ? <StatusBadge tone="info" label={t('dip.dipCheck')} />
        : <StatusBadge tone="warn" label={t('dip.maintenance')} />,
    },
    {
      key: 'fuel', header: t('columns.fuel'),
      cell: (e) => (
        <span className={`inline-block px-2 py-0.5 rounded-badge text-xs font-medium ${FUEL_BADGE[e.fuelType] ?? 'bg-surface-sunken text-ink-2'}`}>
          {codeLabel(e.fuelType)}
        </span>
      ),
    },
    {
      key: 'litres', header: t('columns.litres'), numeric: true,
      cell: (e) => {
        const color = e.type === 'DIP_CHECK'
          ? (e.litres > 0 ? 'text-ok' : e.litres < 0 ? 'text-bad' : 'text-ink-3')
          : 'text-ink'
        return (
          <span className={`font-mono ${color}`}>
            {e.type === 'DIP_CHECK' && e.litres > 0 ? '+' : ''}{fmtQty(e.litres)}
          </span>
        )
      },
    },
    { key: 'pl', header: t('columns.profitLoss'), numeric: true, cell: (e) => <MoneyText value={e.monetaryAmount} showSign tone={signTone(e.monetaryAmount)} className="font-medium" /> },
    {
      key: 'notes', header: t('common:fields.notes'),
      cell: (e) => <span className="block max-w-52 truncate text-ink-2 text-xs" title={e.notes ?? ''}>{e.notes ?? '—'}</span>,
    },
  ]
}

// ── Dip P/L Tab ───────────────────────────────────────────────────────────────

export function DipPlTab({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['reports', 'common'])
  const [query, setQuery] = useReportRange(yesterdayToTodayRange)
  const [from, setFrom] = useState(query.from)
  const [to,   setTo]   = useState(query.to)
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<DipPlEntry[]>({
    queryKey: ['report-dip-pl', pumpId, query.from, query.to],
    queryFn: () => reportApi.getDipPl(pumpId, query.from, query.to),
  })

  const entries = data ?? []
  const paged   = data ? pageSlice(entries, page, pageSize) : null
  const columns = dipColumns(t)

  // Net P/L: sum of all monetaryAmounts (negative = net loss, positive = net gain)
  const netPl    = entries.reduce((s, e) => s + e.monetaryAmount, 0)
  const isNetGain = netPl > 0
  const isNetLoss = netPl < 0

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
          className="ui-btn ui-btn-primary disabled:opacity-60"
        >
          {isFetching ? t('common:loading.app') : t('common:actions.generate')}
        </button>

        <button
          onClick={() => { void printWhenFontsReady() }}
          disabled={!data || entries.length === 0}
          className="ui-btn ui-btn-secondary"
        >
          {t('common:actions.printPdf')}
        </button>
        <CsvExportButton filename={csvFilename('dip-pl', query)} columns={CSV_COLUMNS} rows={entries} />
      </ReportFilterBar>

      {error && <ErrorBox message={serverMessage(error) ?? t('dip.loadFailed')} />}

      {data && paged && (
        <div className="flex flex-col gap-(--density-gap) print:hidden">
          <ReportSummary columns={3}>
            <SummaryCard label={t('dip.totalEntries')}  value={String(entries.length)}  color="text-ink" />
            <SummaryCard
              label={t('dip.netPl')}
              value={<MoneyText value={netPl} showSign />}
              color={isNetGain ? 'text-ok' : isNetLoss ? 'text-bad' : 'text-ink-3'}
            />
            <SummaryCard
              label={t('dip.dipChecks')}
              value={String(entries.filter(e => e.type === 'DIP_CHECK').length)}
              color="text-primary"
            />
          </ReportSummary>

          {entries.length === 0 ? (
            <div className="ui-empty py-6">{t('dip.none')}</div>
          ) : (
            <PageSection title={t('dip.caption')} flush>
              <DataTable
                caption={t('dip.caption')}
                captionHidden
                columns={columns}
                rows={paged.content}
                rowKey={dipEntryKey}
                scroll
                className="rounded-none border-0"
                footer={entries.length > 1 && (
                  <tr className="bg-surface-sunken text-ink">
                    <td colSpan={4}>{t('dip.netPl')}</td>
                    <td className="text-right"><MoneyText value={netPl} showSign tone={signTone(netPl)} /></td>
                    <td />
                  </tr>
                )}
              />
              <div className="px-4">
                <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
              </div>
            </PageSection>
          )}

        </div>
      )}

      {/* Print: full dataset */}
      {data && entries.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title={t('dip.printTitle')} from={query.from} to={query.to} />
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label={t('dip.totalEntries')}  value={String(entries.length)}  color="text-ink" />
            <SummaryCard
              label={t('dip.netPl')}
              value={<MoneyText value={netPl} showSign />}
              color={isNetGain ? 'text-ok' : isNetLoss ? 'text-bad' : 'text-ink-3'}
            />
            <SummaryCard
              label={t('dip.dipChecks')}
              value={String(entries.filter(e => e.type === 'DIP_CHECK').length)}
              color="text-primary"
            />
          </div>
          <DataTable
            caption={t('dip.printCaption')}
            captionHidden
            columns={columns}
            rows={entries}
            rowKey={dipEntryKey}
            footer={entries.length > 1 && (
              <tr className="bg-surface-sunken text-ink">
                <td colSpan={4}>{t('dip.netPl')}</td>
                <td className="text-right"><MoneyText value={netPl} showSign tone={signTone(netPl)} /></td>
                <td />
              </tr>
            )}
          />
        </div>
      )}
    </div>
  )
}
