import { useState } from 'react'
import { codeLabel } from '../../../constants/labels'
import { useTranslation } from 'react-i18next'
import { printWhenFontsReady } from '../../../i18n/fonts'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { reportApi } from '../../../api/reportApi'
import type { InterestAccrualReport, InterestChargeLine } from '../../../api/reportApi'
import { CsvExportButton } from '../../../components/CsvExportButton'
import { csvFilename } from '../../../utils/csv'
import type { CsvColumn } from '../../../utils/csv'
import type { DateRange } from '../../../utils/datePresets'
import { useReportRange, yesterdayToTodayRange } from '../useReportRange'
import { DateRangeInputs, ErrorBox, PrintHeader, ReportFilterBar, ReportSummary, SummaryCard } from '../shared'
import { PageSection } from '../../../components/layout/PageSection'
import { fmtAmt, fmtShortDate } from '../reportFormat'
import { MoneyText } from '../../../components/AmountText'
import { formatDecimal } from '../../../utils/format'

type InterestCsvRow = InterestChargeLine & { clientName: string }

const CSV_COLUMNS: CsvColumn<InterestCsvRow>[] = [
  { header: 'Client', value: (row) => row.clientName },
  { header: 'Period from', value: (row) => row.periodFrom, kind: 'date' },
  { header: 'Period to', value: (row) => row.periodTo, kind: 'date' },
  { header: 'Days', value: (row) => row.daysApplied, kind: 'number' },
  { header: 'Outstanding balance', value: (row) => row.outstandingBalance, kind: 'money' },
  { header: 'Monthly rate %', value: (row) => row.rateApplied, kind: 'number' },
  { header: 'Interest', value: (row) => row.amount, kind: 'money' },
  { header: 'Source', value: (row) => codeLabel(row.source) },
]

// ── Interest Accrual Tab ───────────────────────────────────────────────────────

export function InterestAccrualTab({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['reports', 'common'])
  const [query, setQuery] = useReportRange(yesterdayToTodayRange)
  const [from, setFrom] = useState(query.from)
  const [to,   setTo]   = useState(query.to)

  const { data, isFetching, error } = useQuery<InterestAccrualReport>({
    queryKey: ['report-interest', pumpId, query.from, query.to],
    queryFn:  () => reportApi.getInterestAccrual(pumpId, query.from, query.to),
  })

  const applyRange = (range: DateRange) => {
    setFrom(range.from)
    setTo(range.to)
    setQuery(range)
  }

  const csvRows: InterestCsvRow[] = data
    ? data.clients.flatMap((client) => client.charges.map((charge) => ({ ...charge, clientName: client.clientName })))
    : []

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
            disabled={!data || data.clients.length === 0}
            className="ui-btn ui-btn-secondary"
          >
            {t('common:actions.printPdf')}
          </button>
          <CsvExportButton filename={csvFilename('interest-accrual', query)} columns={CSV_COLUMNS} rows={csvRows} />
      </ReportFilterBar>

      {error && <ErrorBox message={serverMessage(error) ?? t('controls.loadFailed')} />}

      {data && (
        <div className="flex flex-col gap-(--density-gap)">
          <div className="hidden print:block">
            <PrintHeader title={t('interest.printTitle')} from={query.from} to={query.to} />
          </div>
          <ReportSummary columns={3}>
            <SummaryCard label={t('interest.totalCharges')}  value={String(data.totalCharges)}  color="text-ink" />
            <SummaryCard label={t('interest.totalInterest')} value={<MoneyText value={data.totalInterest} />} color="text-bad" />
            <SummaryCard label={t('interest.clients')}        value={String(data.clients.length)} color="text-ink" />
          </ReportSummary>

          {data.clients.length === 0 ? (
            <p className="ui-empty py-8">{t('interest.none')}</p>
          ) : (
            <PageSection title={t('interest.clients')} flush>
            {data.clients.map(client => (
              <div key={client.clientId} className="border-b border-border">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-sunken">
                  <div>
                    <p className="text-sm font-semibold text-ink">{client.clientName}</p>
                    <p className="text-xs text-ink-3">{t('interest.chargeCount', { count: client.chargeCount })}</p>
                  </div>
                  <MoneyText value={client.totalInterest} tone="bad" className="text-sm font-bold" />
                </div>

                <div className="divide-y divide-border text-xs">
                  {client.charges.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="text-ink-3 space-y-0.5">
                        <p>{t('interest.period', { from: fmtShortDate(c.periodFrom), to: fmtShortDate(c.periodTo), days: c.daysApplied })}</p>
                        <p>{t('interest.balanceAtRate', { balance: fmtAmt(c.outstandingBalance), rate: formatDecimal(c.rateApplied), source: codeLabel(c.source) })}</p>
                      </div>
                      <MoneyText value={c.amount} className="font-medium text-ink flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            </PageSection>
          )}

        </div>
      )}
    </div>
  )
}
