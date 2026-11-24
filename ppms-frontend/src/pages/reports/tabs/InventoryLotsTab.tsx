import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { reportApi } from '../../../api/reportApi'
import { pumpApi } from '../../../api/pumpApi'
import type { InventoryLotsReport, AllTanksInventoryReport, InventoryLotLine, ConsumptionLine, CrossTankSummaryLine } from '../../../api/reportApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Pagination } from '../../../components/Pagination'
import { pageSlice } from '../../../utils/pageSlice'
import { DateRangeInputs, ErrorBox, PrintHeader, ReportFilterBar, ReportSummary } from '../shared'
import { PageSection } from '../../../components/layout/PageSection'
import { localDateInputValue } from '../../../utils/date'
import { formatDecimal } from '../../../utils/format'
import { printWhenFontsReady } from '../../../i18n/fonts'
import { useReportRange } from '../useReportRange'
import { fmtQty, fmtShortDate, fmtShortDayMonth } from '../reportFormat'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { StatusBadge } from '../../../components/StatusBadge'
import { LitresText, MoneyText } from '../../../components/AmountText'
import { codeLabel } from '../../../constants/labels'
import { CsvExportButton } from '../../../components/CsvExportButton'
import { csvFilename } from '../../../utils/csv'
import type { CsvColumn } from '../../../utils/csv'
import type { DateRange } from '../../../utils/datePresets'

const ALL_TANKS_DEFAULT_DAYS = 90

type ReportsT = TFunction<['reports', 'common']>

function LotBadges({ lot, dipLabel }: { lot: InventoryLotLine; dipLabel?: string }) {
  const { t } = useTranslation(['reports', 'common'])
  return (
    <>
      <StatusBadge tone={lot.status === 'ACTIVE' ? 'ok' : 'neutral'} label={codeLabel(lot.status)} />
      {lot.isDipAdjustment && <StatusBadge tone="warn" label={dipLabel ?? t('inventory.dipAdjusted')} className="ml-1" />}
    </>
  )
}

function consumptionColumns(t: ReportsT, lot: InventoryLotLine): DataTableColumn<ConsumptionLine>[] {
  return [
    { key: 'reference', header: t('columns.tankerRef'), cell: () => <span className="text-ink-2 font-medium">{lot.tankerReference}</span> },
    { key: 'date', header: t('columns.date'), cell: (c) => <span className="text-ink-3">{fmtShortDayMonth(c.consumedAt)}</span> },
    { key: 'source', header: t('columns.source'), cell: (c) => <span className="text-ink-3">{codeLabel(c.sourceType)}</span> },
    { key: 'shift', header: t('columns.shift'), cell: (c) => <span className="text-ink-3">{c.shiftName ?? '—'}</span> },
    {
      key: 'quantity', header: t('columns.quantityLitres'), numeric: true,
      cell: (c) => <span className="text-ink">{formatDecimal(c.quantityConsumed)}</span>,
    },
    { key: 'cost', header: t('columns.costPerLitre'), numeric: true, cell: (c) => <MoneyText value={c.costPricePerUnit} className="text-ink-2" /> },
    { key: 'total', header: t('common:fields.total'), numeric: true, cell: (c) => <MoneyText value={c.totalCost} className="font-medium text-ink" /> },
  ]
}

function tankLotColumns(t: ReportsT): DataTableColumn<InventoryLotLine>[] {
  return [
    { key: 'reference', header: t('columns.tankerRef'), cell: (lot) => <span className="text-ink-2">{lot.tankerReference}</span> },
    { key: 'delivered', header: t('columns.deliveryDate'), cell: (lot) => <span className="text-ink-3">{fmtShortDate(lot.deliveryDate)}</span> },
    { key: 'cost', header: t('columns.costPerLitre'), numeric: true, cell: (lot) => <MoneyText value={lot.costPricePerUnit} className="text-ink-2" /> },
    { key: 'original', header: t('columns.original'), numeric: true, cell: (lot) => <LitresText value={lot.originalQuantity} className="text-ink-3" /> },
    { key: 'remaining', header: t('columns.remaining'), numeric: true, cell: (lot) => <LitresText value={lot.remainingQuantity} className="font-medium text-ink" /> },
    { key: 'status', header: t('columns.status'), cell: (lot) => <LotBadges lot={lot} dipLabel={t('inventory.dip')} /> },
  ]
}

function crossTankColumns(t: ReportsT): DataTableColumn<CrossTankSummaryLine>[] {
  return [
    { key: 'fuel', header: t('columns.fuelType'), cell: (row) => <span className="font-medium text-ink">{codeLabel(row.fuelType)}</span> },
    { key: 'remaining', header: t('columns.totalRemaining'), numeric: true, cell: (row) => <LitresText value={row.totalRemaining} className="text-ink-2" /> },
    {
      key: 'avgCost', header: t('columns.weightedAvgCost'), numeric: true,
      cell: (row) => row.weightedAvgCostPerUnit != null ? <span className="text-ink-2"><MoneyText value={row.weightedAvgCostPerUnit} />/L</span> : <span className="text-ink-2">—</span>,
    },
    { key: 'value', header: t('columns.totalValue'), numeric: true, cell: (row) => <MoneyText value={row.totalStockValue} className="font-semibold text-ink" /> },
  ]
}

const CSV_COLUMNS: CsvColumn<InventoryLotLine>[] = [
  { header: 'Lot', value: (row) => row.lotId, kind: 'number' },
  { header: 'Reference', value: (row) => row.tankerReference },
  { header: 'Fuel', value: (row) => codeLabel(row.fuelType) },
  { header: 'Delivery date', value: (row) => row.deliveryDate, kind: 'date' },
  { header: 'Original litres', value: (row) => row.originalQuantity.toFixed(2), kind: 'number' },
  { header: 'Consumed litres', value: (row) => row.totalConsumed.toFixed(2), kind: 'number' },
  { header: 'Remaining litres', value: (row) => row.remainingQuantity.toFixed(2), kind: 'number' },
  { header: 'Cost per litre', value: (row) => row.costPricePerUnit, kind: 'money' },
  { header: 'Cost of goods consumed', value: (row) => row.totalCogsConsumed, kind: 'money' },
  { header: 'Status', value: (row) => codeLabel(row.status) },
]

function allTanksDefaultRange() {
  return { from: localDateInputValue(-(ALL_TANKS_DEFAULT_DAYS - 1)), to: localDateInputValue() }
}

// ── Inventory Lots Tab ────────────────────────────────────────────────────────

export function InventoryLotsTab({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation(['reports', 'common'])
  const [tankId, setTankId] = useState<string>('')    // '' = All Tanks, '123' = specific tank id
  const [query,  setQuery]  = useState<string>('')    // mirrors tankId on Load click
  const [range, setRange] = useReportRange(allTanksDefaultRange)
  const [from, setFrom] = useState(range.from)
  const [to,   setTo]   = useState(range.to)
  const [expandedLot, setExpandedLot] = useState<number | null>(null)
  const expandedContentId = useId()

  const { data: tanks = [] } = useQuery({
    queryKey: ['tanks', pumpId],
    queryFn: () => pumpApi.getTanks(pumpId),
  })

  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data: singleTankData, isFetching: singleFetching, error: singleError } =
    useQuery<InventoryLotsReport>({
      queryKey: ['report-inventory-single', pumpId, query],
      queryFn:  () => reportApi.getInventoryLots(pumpId, Number(query)),
      enabled:  query !== '' && query !== null,
    })

  const { data: allTanksData, isFetching: allFetching, error: allError } =
    useQuery<AllTanksInventoryReport>({
      queryKey: ['report-inventory-all', pumpId, range.from, range.to],
      queryFn:  () => reportApi.getAllTanksInventoryLots(pumpId, range.from, range.to),
      enabled:  query === '' && !!range.from && !!range.to,
    })

  const isFetching = singleFetching || allFetching
  const error      = singleError ?? allError
  const data       = singleTankData
  const paged      = data ? pageSlice(data.lots, page, pageSize) : null
  const csvRows    = query === '' ? (allTanksData?.tanks.flatMap((tank) => tank.lots) ?? []) : (data?.lots ?? [])

  const applyRange = (next: DateRange) => {
    setFrom(next.from)
    setTo(next.to)
    setQuery('')
    setRange(next)
    setPage(0)
  }

  return (
    <div className="flex flex-col gap-(--density-gap)">
      <ReportFilterBar>
          <div className="w-56">
            <span className="ui-label">{t('inventory.tank')}</span>
            <SearchableSelect label={t('inventory.tank')}
              value={tankId}
              onChange={(v) => setTankId(v ?? '')}
              options={[
                { value: '', label: t('inventory.allTanks') },
                ...tanks.map(tank => ({ value: String(tank.id), label: `${tank.tankIdentifier} (${codeLabel(tank.fuelType)})` })),
              ]}
              placeholder={t('inventory.selectTank')}
            />
          </div>
          {tankId === '' && <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} onPreset={applyRange} />}
          <button
            onClick={() => { setQuery(tankId); setRange({ from, to }); setPage(0) }}
            disabled={isFetching}
            className="ui-btn ui-btn-primary"
          >
            {isFetching ? t('common:loading.short') : t('inventory.loadLots')}
          </button>
          <button
            onClick={() => { void printWhenFontsReady() }}
            disabled={!data || data.lots.length === 0}
            className="ui-btn ui-btn-secondary"
          >
            {t('common:actions.printPdf')}
          </button>
          <CsvExportButton
            filename={csvFilename(query === '' ? 'inventory-lots' : `inventory-lots-tank-${query}`, query === '' ? range : undefined)}
            columns={CSV_COLUMNS}
            rows={csvRows}
          />
      </ReportFilterBar>

      {query === '' && (
        <p className="ui-help print:hidden">
          {t('inventory.allTanksHelp', { from: fmtShortDate(range.from), to: fmtShortDate(range.to) })}
        </p>
      )}

      {error && <ErrorBox message={serverMessage(error) ?? t('controls.loadFailed')} />}

      {/* Single-tank view */}
      {data && paged && query !== '' && (
        <div className="flex flex-col gap-(--density-gap) print:hidden">
          {data.weightedAvgCostPerUnit != null && (
            <ReportSummary columns={3}>
              <div className="ui-card ui-card-muted p-3">
                <p className="ui-kpi-label">{t('inventory.totalRemaining')}</p>
                <p className="text-sm font-semibold text-ink mt-0.5"><LitresText value={data.totalRemaining} /></p>
              </div>
              <div className="ui-card ui-card-muted p-3">
                <p className="ui-kpi-label">{t('inventory.avgCost')}</p>
                <p className="text-sm font-semibold text-ink mt-0.5"><MoneyText value={data.weightedAvgCostPerUnit} />/L</p>
              </div>
              <div className="ui-card ui-card-muted p-3">
                <p className="ui-kpi-label">{t('inventory.stockValue')}</p>
                <MoneyText value={data.totalStockValue} className="block text-sm font-semibold text-ink mt-0.5" />
              </div>
            </ReportSummary>
          )}

          <PageSection
            title={t('inventory.lotsTitle')}
            titleMeta={<span className="text-xs text-ink-3">{t('inventory.lotsInTank', { count: data.totalLots })}</span>}
            flush
          >
          {paged.content.map((lot) => (
            <div key={lot.lotId} className="border-b border-border">
              <button
                type="button"
                className="ui-accordion-trigger flex-wrap"
                aria-expanded={expandedLot === lot.lotId}
                aria-controls={expandedLot === lot.lotId ? `${expandedContentId}-lot-${lot.lotId}` : undefined}
                onClick={() => setExpandedLot(expandedLot === lot.lotId ? null : lot.lotId)}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <LotBadges lot={lot} />
                  <span className="text-sm font-medium text-ink">{fmtShortDate(lot.deliveryDate)}</span>
                  <span className="text-xs text-ink-3">{codeLabel(lot.fuelType)}</span>
                  <span className="text-xs text-ink-3">{lot.tankerReference}</span>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-ink-3">
                  <span><MoneyText value={lot.costPricePerUnit} />/L</span>
                  <span>{t('inventory.remaining', { quantity: fmtQty(lot.remainingQuantity) })}</span>
                  <span><MoneyText value={lot.totalCogsConsumed} /> {t('inventory.cogsSuffix')}</span>
                  {expandedLot === lot.lotId
                    ? <ChevronUp size={14} strokeWidth={2} className="text-ink-3" />
                    : <ChevronDown size={14} strokeWidth={2} className="text-ink-3" />
                  }
                </div>
              </button>
              {expandedLot === lot.lotId && (
                <div id={`${expandedContentId}-lot-${lot.lotId}`}>
                  {lot.consumptions.length > 0 ? (
                    <DataTable
                      caption={t('inventory.consumptionCaption', { reference: lot.tankerReference })}
                      captionHidden
                      columns={consumptionColumns(t, lot)}
                      rows={lot.consumptions}
                      rowKey={(c) => c.id}
                      className="rounded-none border-x-0 border-b-0"
                      tableClassName="text-xs"
                    />
                  ) : (
                    <p className="ui-empty border-t border-border px-4 py-3">{t('inventory.noConsumptions')}</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {paged.content.length === 0 && (
            <div className="ui-empty m-4 py-6">{t('inventory.noLotsForTank')}</div>
          )}
          <div className="px-4">
            <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
          </div>
          </PageSection>
        </div>
      )}

      {/* All-tanks view */}
      {allTanksData && query === '' && (
        <div className="flex flex-col gap-(--density-gap) print:hidden">
          {allTanksData.tanks.length === 0 ? (
            <div className="ui-empty py-6">{t('inventory.noTanks')}</div>
          ) : (
            <>
              <PageSection title={t('inventory.tanksTitle')} flush>
              {allTanksData.tanks.map((section) => (
                <div key={section.tankId} className="border-b border-border">
                  <button
                    type="button"
                    className="ui-accordion-trigger"
                    aria-expanded={expandedLot === section.tankId}
                    aria-controls={expandedLot === section.tankId ? `${expandedContentId}-tank-${section.tankId}` : undefined}
                    onClick={() => setExpandedLot(expandedLot === section.tankId ? null : section.tankId)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-ink">{section.tankIdentifier}</span>
                      <span className="text-xs text-ink-3">{codeLabel(section.fuelType)}</span>
                      <StatusBadge tone="neutral" label={t('inventory.lotCount', { value: section.lotCount })} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-ink-3">
                      <span>{t('inventory.remaining', { quantity: fmtQty(section.totalRemaining) })}</span>
                      {section.weightedAvgCostPerUnit != null && (
                        <span>{t('inventory.averagePerLitre', { cost: formatDecimal(section.weightedAvgCostPerUnit) })}</span>
                      )}
                      <span><MoneyText value={section.totalStockValue} /> {t('inventory.valueSuffix')}</span>
                      {expandedLot === section.tankId
                        ? <ChevronUp size={14} strokeWidth={2} className="text-ink-3" />
                        : <ChevronDown size={14} strokeWidth={2} className="text-ink-3" />}
                    </div>
                  </button>
                  {expandedLot === section.tankId && (
                    <div id={`${expandedContentId}-tank-${section.tankId}`} className="p-4 border-t border-border">
                      {section.lots.length === 0 ? (
                        <p className="ui-empty">{t('inventory.noLotsInTank')}</p>
                      ) : (
                        <DataTable
                          caption={t('inventory.lotsInCaption', { tank: section.tankIdentifier })}
                          captionHidden
                          columns={tankLotColumns(t)}
                          rows={section.lots}
                          rowKey={(lot) => lot.lotId}
                          tableClassName="text-xs"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
              </PageSection>

              <PageSection title={t('inventory.crossTankSummary')} flush>
                <DataTable
                  caption={t('inventory.crossTankSummary')}
                  captionHidden
                  columns={crossTankColumns(t)}
                  rows={allTanksData.crossTankSummary}
                  rowKey={(row) => row.fuelType}
                  className="rounded-none border-0"
                />
              </PageSection>

            </>
          )}
        </div>
      )}

      {/* Print: single-tank full dataset */}
      {data && data.lots.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title={t('inventory.printTitle')} />
          <p className="text-xs text-ink-3 mb-2">{t('inventory.lotsInTank', { count: data.totalLots })}</p>
          {data.lots.map((lot) => (
            <div key={lot.lotId} className="mb-4">
              <div className="flex items-center gap-3 mb-1 pb-1 border-b border-border flex-wrap">
                <LotBadges lot={lot} />
                <span className="text-sm font-medium text-ink">{fmtShortDate(lot.deliveryDate)}</span>
                <span className="text-xs text-ink-3">{codeLabel(lot.fuelType)}</span>
                <span className="text-xs text-ink-3">{lot.tankerReference}</span>
                <span className="text-xs text-ink-3"><MoneyText value={lot.costPricePerUnit} />/L</span>
                <span className="text-xs text-ink-3">{t('inventory.remaining', { quantity: fmtQty(lot.remainingQuantity) })}</span>
                <span className="text-xs text-ink-3"><MoneyText value={lot.totalCogsConsumed} /> {t('inventory.cogsSuffix')}</span>
              </div>
              {lot.consumptions.length > 0 ? (
                <DataTable
                  caption={t('inventory.consumptionCaption', { reference: lot.tankerReference })}
                  captionHidden
                  columns={consumptionColumns(t, lot)}
                  rows={lot.consumptions}
                  rowKey={(c) => c.id}
                  tableClassName="text-xs"
                />
              ) : (
                <p className="ui-empty px-3 py-2">{t('inventory.noConsumptions')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
