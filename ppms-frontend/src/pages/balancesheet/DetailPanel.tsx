import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { serverText } from '../../utils/serverText'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useAuthStore } from '../../store/authStore'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { parseApiError } from '../../utils/apiError'
import { useToastStore } from '../../store/toastStore'
import type { BsFuelLine, BsShiftLine } from '../../api/balanceSheetApi'
import type { DeletableSheet } from './DeleteConfirmModal'
import { SkeletonRows } from '../../components/Skeleton'
import { IconButton } from '../../components/IconButton'
import { DiscrepancyTd, FuelLineRow, ShiftLineRow, SummaryTile, Td } from './bsTableCells'
import { ExpensesSection } from './sections/ExpensesSection'
import { bsColumn, fmtDate, fmtDateTime } from './bsFormat'
import { ProductSalesSection } from './sections/ProductSalesSection'
import { SettlementSection } from './sections/SettlementSection'
import { DipPlSection } from './sections/DipPlSection'
import { MeterAmendmentsSection } from './sections/MeterAmendmentsSection'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { LitresText, MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { Link } from 'react-router-dom'
import { CsvExportButton } from '../../components/CsvExportButton'
import { csvFilename } from '../../utils/csv'
import type { CsvColumn } from '../../utils/csv'
import { discrepanciesUrl, shiftsForFuelUrl } from '../../utils/drillDown'
import { printWhenFontsReady } from '../../i18n/fonts'

// CSV headers stay in English: the files are shared with accountants.

const FUEL_COLUMNS: CsvColumn<BsFuelLine>[] = [
  { header: 'Fuel', value: (row) => row.fuelType },
  { header: 'Opening stock litres', value: (row) => row.openingStock.toFixed(2), kind: 'number' },
  { header: 'Delivered litres', value: (row) => row.deliveredLitres.toFixed(2), kind: 'number' },
  { header: 'Sold litres', value: (row) => row.soldLitres.toFixed(2), kind: 'number' },
  { header: 'Closing stock litres', value: (row) => row.closingStock.toFixed(2), kind: 'number' },
  { header: 'Selling price', value: (row) => row.sellingPrice, kind: 'money' },
  { header: 'Revenue', value: (row) => row.expectedRevenue, kind: 'money' },
  { header: 'Stock variance litres', value: (row) => row.stockVariance.toFixed(2), kind: 'number' },
  { header: 'Credit sold', value: (row) => row.creditSoldAmount, kind: 'money' },
]

const FUEL_PROFIT_COLUMNS: CsvColumn<BsFuelLine>[] = [
  { header: 'Cost of goods', value: (row) => row.costOfGoods, kind: 'money' },
  { header: 'Gross profit', value: (row) => row.grossProfit, kind: 'money' },
  { header: 'Dip loss', value: (row) => row.dipLossAmount, kind: 'money' },
]

const SHIFT_COLUMNS: CsvColumn<BsShiftLine>[] = [
  { header: 'Shift', value: (row) => row.shiftId, kind: 'number' },
  { header: 'Operator', value: (row) => row.operatorName },
  { header: 'DU', value: (row) => row.duNumber, kind: 'number' },
  { header: 'Fuels', value: (row) => row.fuelTypesSummary },
  { header: 'Litres', value: (row) => row.litresSold.toFixed(2), kind: 'number' },
  { header: 'Expected', value: (row) => row.expectedRevenue, kind: 'money' },
  { header: 'Cash', value: (row) => row.cashCollected, kind: 'money' },
  { header: 'UPI', value: (row) => row.upiCollected, kind: 'money' },
  { header: 'Card', value: (row) => row.cardCollected, kind: 'money' },
  { header: 'Fleet card', value: (row) => row.fleetCardCollected ?? 0, kind: 'money' },
  { header: 'Credit', value: (row) => row.creditAmount, kind: 'money' },
  { header: 'Discrepancy', value: (row) => row.discrepancy, kind: 'money' },
]

type BalanceSheetT = TFunction<['balancesheet', 'common']>

function shiftTableColumns(t: BalanceSheetT): DataTableColumn<BsShiftLine>[] {
  return [
    bsColumn('operator', t('columns.operator')),
    bsColumn('du', t('columns.duNozzle')),
    bsColumn('fuels', t('columns.fuels')),
    bsColumn('litres', t('columns.litres'), true),
    bsColumn('expected', t('columns.expected'), true),
    bsColumn('received', t('columns.received'), true),
    bsColumn('cash', t('common:paymentMethods.CASH'), true),
    bsColumn('upi', t('common:paymentMethods.UPI'), true),
    bsColumn('card', t('common:paymentMethods.CARD'), true),
    bsColumn('fleet', t('columns.fleet'), true),
    bsColumn('credit', t('common:paymentMethods.CREDIT'), true),
    bsColumn('discrepancy', t('columns.discrepancy'), true),
  ]
}

function fuelTableColumns(t: BalanceSheetT, isOwnerOrAdmin: boolean): DataTableColumn<BsFuelLine>[] {
  return [
    bsColumn('fuel', t('columns.fuel')),
    bsColumn('opening', t('columns.openingStock'), true),
    bsColumn('delivered', t('columns.delivered'), true),
    bsColumn('sold', t('columns.sold'), true),
    bsColumn('closing', t('columns.closingStock'), true),
    bsColumn('price', t('columns.sellingPrice'), true),
    bsColumn('revenue', t('columns.revenue'), true),
    ...(isOwnerOrAdmin ? [bsColumn<BsFuelLine>('cogs', t('columns.cogs'), true), bsColumn<BsFuelLine>('profit', t('columns.profit'), true)] : []),
    bsColumn('variance', t('columns.stockVariance'), true),
    ...(isOwnerOrAdmin ? [bsColumn<BsFuelLine>('dipLoss', t('columns.dipLoss'), true)] : []),
    bsColumn('credit', t('columns.creditSold'), true),
  ]
}

interface DetailPanelProps {
  pumpId: number
  reportId: number
  onClose: () => void
  canDelete: boolean
  onDelete: (sheet: DeletableSheet) => void
  onRegenerated: (newReportId: number) => void
  pumpName: string
}

export function DetailPanel({ pumpId, reportId, onClose, canDelete, onDelete, onRegenerated, pumpName }: DetailPanelProps) {
  const { t } = useTranslation(['balancesheet', 'common'])
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['balance-sheet-detail', pumpId, reportId],
    queryFn: () => balanceSheetApi.getById(pumpId, reportId),
  })
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const regenerateMutation = useMutation({
    mutationFn: () => balanceSheetApi.regenerate(pumpId, reportId),
    onSuccess: (regenerated) => {
      qc.invalidateQueries({ queryKey: ['balance-sheets', pumpId] })
      addToast(t('detail.regenerated'), 'success')
      onRegenerated(regenerated.id)
    },
    onError: (err) => addToast(parseApiError(err, t('detail.regenerateFailed')), 'error'),
  })

  if (error) {
    return (
      <div className="space-y-3">
        <div className="ui-alert ui-alert-danger text-sm" role="alert">
          {parseApiError(error, t('detail.loadFailed'))}
        </div>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">{t('detail.backToList')}</button>
      </div>
    )
  }

  if (isLoading || !detail) {
    return (
      <div>
        <SkeletonRows count={6} />
      </div>
    )
  }

  const sheetRange = { from: detail.reportDate, to: detail.reportDate }
  const fuelColumns = isOwnerOrAdmin ? [...FUEL_COLUMNS, ...FUEL_PROFIT_COLUMNS] : FUEL_COLUMNS

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge tone={detail.reportType === 'DAY' ? 'neutral' : 'info'} label={detail.reportType === 'DAY' ? t('detail.dayEnd') : t('detail.shift')} />
            <h2 className="text-base font-semibold text-ink">
              <span className="hidden print:inline">{t('detail.printTitlePrefix')}</span>{serverText(detail.periodLabelCode, detail.periodLabelParams, detail.periodLabel)}
            </h2>
          </div>
          <p className="text-xs text-ink-3 mt-0.5">
            {t('detail.generatedLine', { date: fmtDate(detail.reportDate), generatedAt: fmtDateTime(detail.generatedAt), name: detail.generatedByUserName })}
            {pumpName && <span className="hidden print:inline"> · {t('detail.pumpLabel')} <span className="font-medium">{pumpName}</span></span>}
          </p>
          {detail.reportType === 'DAY' && detail.includedShiftNames && detail.includedShiftNames.length > 0 && (
            <p className="text-xs text-ink-3 mt-1">
              {t('detail.shiftsIncluded')}{' '}
              {detail.includedShiftNames.map(name => (
                <span key={name} className="inline-flex items-center px-1.5 py-0.5 rounded-badge text-xs font-medium bg-surface-sunken text-ink-2 mr-1">
                  {name}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {canDelete && (
            <button
              onClick={() => onDelete(detail)}
              className="text-xs text-bad hover:text-bad-strong border border-bad hover:bg-bad-bg px-3 py-1.5 rounded-control transition-colors"
            >
              {t('common:actions.delete')}
            </button>
          )}
          <button
            onClick={() => { void printWhenFontsReady() }}
            className="text-xs text-ink-2 hover:text-ink border border-control hover:border-ink-3 px-3 py-1.5 rounded-control transition-colors"
          >
            {t('common:actions.printPdf')}
          </button>
          <IconButton
            onClick={onClose}
            className="hidden lg:block text-ink-3 hover:text-ink-2 text-xl leading-none"
            label={t('detail.closeDetails')}
            icon={'×'}
          />
        </div>
      </div>

      <div className="space-y-6 pt-5">
        {(detail.stale || detail.linesChangedSinceGenerated) && (
          <div role="alert" className="ui-alert ui-alert-warning text-sm flex flex-wrap items-center justify-between gap-2">
            <span>
              {t('detail.outOfDate')}{' '}
              {detail.staleReason ? serverText(detail.staleReasonCode, detail.staleReasonParams, detail.staleReason) : t('detail.defaultStaleReason')}
              {' '}{t('detail.staleTail')}
            </span>
            {canDelete && (
              <button
                type="button"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="ui-btn ui-btn-primary ui-btn-compact print:hidden"
              >
                {regenerateMutation.isPending ? t('detail.regenerating') : t('detail.regenerate')}
              </button>
            )}
          </div>
        )}
        {detail.openShiftCount > 0 && (
          <div className="ui-alert ui-alert-warning text-sm">
            {t('detail.openShifts', { count: detail.openShiftCount })}
          </div>
        )}

        {/* Notes */}
        {detail.notes && (
          <div className="ui-card-plain ui-card-muted px-4 py-3 text-sm text-ink-2">
            {detail.notes}
          </div>
        )}

        {/* Cash summary tiles */}
        <section>
          <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-3">{t('summary.title')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryTile label={t('summary.expectedRevenue')} value={<MoneyText value={detail.totalExpectedRevenue} />} />
            <SummaryTile label={t('summary.cashCollected')} value={<MoneyText value={detail.totalCashCollected} />} />
            <SummaryTile label={t('summary.upiCollected')} value={<MoneyText value={detail.totalUpiCollected} />} />
            <SummaryTile label={t('summary.cardCollected')} value={<MoneyText value={detail.totalCardCollected} />} />
            <SummaryTile label={t('summary.creditSold')} value={<MoneyText value={detail.totalCreditSold} />} accent="amber" />
            {detail.reportType === 'DAY' && (
              <SummaryTile label={t('summary.creditRecovered')} value={<MoneyText value={detail.totalCreditRecovered} />} accent="green" />
            )}
            {detail.reportType === 'DAY' && (detail.totalCashRecovery ?? 0) > 0 && (
              <SummaryTile label={t('summary.cashRecovery')} value={<MoneyText value={detail.totalCashRecovery} />} accent="green" sublabel={t('summary.cashRecoveryNote')} />
            )}
            <SummaryTile
              label={t('summary.cashDiscrepancy')}
              value={<MoneyText value={Math.abs(detail.cashDiscrepancy)} />}
              sublabel={detail.cashDiscrepancy > 0 ? t('summary.over') : detail.cashDiscrepancy < 0 ? t('summary.short') : t('summary.balanced')}
              accent={detail.cashDiscrepancy === 0 ? 'green' : detail.cashDiscrepancy < 0 ? 'red' : 'amber'}
            />
            {detail.cashDiscrepancy !== 0 && (
              <p className="col-span-full -mt-1 text-xs print:hidden">
                <Link to={discrepanciesUrl(sheetRange)} className="ui-link">
                  {t('summary.viewShortOver', { date: fmtDate(detail.reportDate) })}
                </Link>
              </p>
            )}
            <SummaryTile label={t('summary.totalLitresSold')} value={<LitresText value={detail.totalLitresSold} decimals={1} />} />
            {detail.reportType === 'DAY' && (
              <SummaryTile label={t('summary.litresDelivered')} value={<LitresText value={detail.totalLitresDelivered} decimals={1} />} />
            )}
            {isOwnerOrAdmin && <SummaryTile label={t('summary.costOfGoods')} value={<MoneyText value={detail.totalCostOfGoods} />} />}
            {isOwnerOrAdmin && (
              <SummaryTile
                label={detail.reportType === 'DAY' ? t('summary.fuelGrossProfit') : t('summary.grossProfit')}
                value={<MoneyText value={detail.totalGrossProfit} />}
                accent={detail.totalGrossProfit >= 0 ? 'green' : 'red'}
              />
            )}
            {isOwnerOrAdmin && detail.reportType === 'DAY' && detail.productSales && (
              <SummaryTile
                label={t('summary.productSalesProfit')}
                value={<MoneyText value={detail.productSales.grossProfit} />}
                accent={detail.productSales.grossProfit >= 0 ? 'green' : 'red'}
              />
            )}
            {detail.reportType === 'DAY' && detail.expenses && (
              <SummaryTile
                label={t('summary.expenses')}
                value={<MoneyText value={-detail.expenses.totalAmount} showSign />}
                accent="red"
              />
            )}
            {isOwnerOrAdmin && detail.dipPlEntries?.length > 0 && (
              <SummaryTile
                label={t('summary.dipPl')}
                value={<MoneyText value={detail.totalDipNetAmount} showSign />}
                accent={detail.totalDipNetAmount > 0 ? 'green' : 'red'}
              />
            )}
            {isOwnerOrAdmin && (detail.reportType === 'DAY' ? (
              <SummaryTile
                label={t('summary.netProfit')}
                value={<MoneyText value={detail.totalNetProfit} />}
                accent={detail.totalNetProfit >= 0 ? 'green' : 'red'}
              />
            ) : detail.dipPlEntries?.length > 0 && (
              <SummaryTile
                label={t('summary.netProfit')}
                value={<MoneyText value={detail.totalNetProfit} />}
                accent={detail.totalNetProfit >= 0 ? 'green' : 'red'}
              />
            ))}
          {!isOwnerOrAdmin && (
            <p className="text-xs text-ink-3 col-span-full mt-1">
              {t('summary.ownerOnly')}
            </p>
          )}
          </div>
        </section>

        {/* Fuel lines */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider">{t('fuel.title')}</h3>
            <CsvExportButton
              filename={csvFilename(`balance-sheet-${reportId}-fuel`, sheetRange)}
              columns={fuelColumns}
              rows={detail.fuelLines}
            />
          </div>
          <DataTable
            caption={t('fuel.caption')}
            captionHidden
            regionLabel={t('fuel.region')}
            columns={fuelTableColumns(t, isOwnerOrAdmin)}
            rows={detail.fuelLines}
            rowKey={(line) => line.fuelType}
            renderRow={(line) => <FuelLineRow line={line} shiftsHref={shiftsForFuelUrl(sheetRange, line.fuelType)} />}
            className="print:overflow-visible"
            tableClassName="min-w-[900px] print:min-w-0 print:text-[8pt]"
          />
        </section>

        {/* Shift lines */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider">
              {t('shifts.title')} <span className="text-ink-3 normal-case font-normal">{t('shifts.count', { count: detail.shiftLines.length })}</span>
            </h3>
            <CsvExportButton
              filename={csvFilename(`balance-sheet-${reportId}-shifts`, sheetRange)}
              columns={SHIFT_COLUMNS}
              rows={detail.shiftLines}
            />
          </div>
          <DataTable
            caption={t('shifts.caption')}
            captionHidden
            regionLabel={t('shifts.region')}
            columns={shiftTableColumns(t)}
            rows={detail.shiftLines}
            rowKey={(line) => line.shiftId}
            renderRow={(line) => <ShiftLineRow line={line} />}
            scroll
            className="print:overflow-visible"
            tableClassName="min-w-[960px] text-xs print:min-w-0 print:text-[7pt]"
            footer={detail.shiftLines.length > 1 && (
              <tr className="bg-surface-sunken text-ink">
                <Td colSpan={3}>{t('common:fields.total')}</Td>
                <Td right><LitresText value={detail.shiftLines.reduce((s, l) => s + l.litresSold, 0)} decimals={1} /></Td>
                <Td right><MoneyText value={detail.shiftLines.reduce((s, l) => s + l.expectedRevenue, 0)} /></Td>
                <Td right><MoneyText value={detail.shiftLines.reduce((s, l) => s + l.cashCollected + l.upiCollected + l.cardCollected + (l.fleetCardCollected ?? 0), 0)} /></Td>
                <Td right><MoneyText value={detail.shiftLines.reduce((s, l) => s + l.cashCollected, 0)} /></Td>
                <Td right><MoneyText value={detail.shiftLines.reduce((s, l) => s + l.upiCollected, 0)} /></Td>
                <Td right><MoneyText value={detail.shiftLines.reduce((s, l) => s + l.cardCollected, 0)} /></Td>
                <Td right><MoneyText value={detail.shiftLines.reduce((s, l) => s + (l.fleetCardCollected ?? 0), 0)} /></Td>
                <Td right><MoneyText value={detail.shiftLines.reduce((s, l) => s + l.creditAmount, 0)} /></Td>
                <DiscrepancyTd value={detail.shiftLines.reduce((s, l) => s + l.discrepancy, 0)} />
              </tr>
            )}
          />
        </section>

        {/* Meter Reading Amendments — only shown when amendments occurred in this period */}
        {detail.meterAmendments?.length > 0 && (
          <MeterAmendmentsSection detail={detail} />
        )}

        {/* Dip P/L — shown when any dip activity (maintenance removal or dipstick check) occurred */}
        {isOwnerOrAdmin && detail.dipPlEntries?.length > 0 && (
          <DipPlSection detail={detail} />
        )}

        {/* Ancillary Product Sales — DAY reports only */}
        {detail.reportType === 'DAY' && detail.productSales && (
          <ProductSalesSection productSales={detail.productSales} />
        )}

        {/* Approved Expenses — DAY reports only */}
        {detail.reportType === 'DAY' && detail.expenses && (
          <ExpensesSection expenses={detail.expenses} />
        )}

        {/* Payment Settlements — DAY reports only */}
        {detail.reportType === 'DAY' && detail.settlementSummary && (
          <SettlementSection summary={detail.settlementSummary} />
        )}
      </div>
    </div>
  )
}
