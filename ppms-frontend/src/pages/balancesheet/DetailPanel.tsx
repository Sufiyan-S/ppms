import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { balanceSheetApi } from '../../api/balanceSheetApi'
import { parseApiError } from '../../utils/apiError'
import type { BalanceSheetSummary, BsFuelLine, BsShiftLine } from '../../api/balanceSheetApi'
import { SkeletonRows } from '../../components/Skeleton'
import { IconButton } from '../../components/IconButton'
import { DiscrepancyTd, FuelLineRow, ShiftLineRow, SummaryTile, Td, Th } from './bsTableCells'
import { ExpensesSection } from './sections/ExpensesSection'
import { fmtDate, fmtDateTime, fmtLitres, fmtMoney } from './bsFormat'
import { ProductSalesSection } from './sections/ProductSalesSection'
import { SettlementSection } from './sections/SettlementSection'
import { DipPlSection } from './sections/DipPlSection'
import { MeterAmendmentsSection } from './sections/MeterAmendmentsSection'
import { ScrollRegion } from '../../components/ScrollRegion'

// ── Detail Panel ────────────────────────────────────────────────────────────────

interface DetailPanelProps {
  pumpId: number
  reportId: number
  onClose: () => void
  canDelete: boolean
  onDelete: (summary: BalanceSheetSummary) => void
  summary: BalanceSheetSummary
  pumpName: string
}

export function DetailPanel({ pumpId, reportId, onClose, canDelete, onDelete, summary, pumpName }: DetailPanelProps) {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['balance-sheet-detail', pumpId, reportId],
    queryFn: () => balanceSheetApi.getById(pumpId, reportId),
  })

  if (error) {
    return (
      <div className="flex-1 px-6 py-6 space-y-3">
        <div className="ui-alert ui-alert-error text-sm" role="alert">
          {parseApiError(error, 'Failed to load this balance sheet. Please try again.')}
        </div>
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Back to list</button>
      </div>
    )
  }

  if (isLoading || !detail) {
    return (
      <div className="flex-1 px-6 py-6">
        <SkeletonRows count={6} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible">
      {/* Detail header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              detail.reportType === 'DAY' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {detail.reportType === 'DAY' ? 'Day End' : 'Shift'}
            </span>
            <h2 className="text-base font-semibold text-slate-800">
              <span className="hidden print:inline">Balance Sheet — </span>{detail.periodLabel}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {fmtDate(detail.reportDate)} · Generated {fmtDateTime(detail.generatedAt)} by {detail.generatedByUserName}
            {pumpName && <span className="hidden print:inline"> · Pump: <span className="font-medium">{pumpName}</span></span>}
          </p>
          {detail.reportType === 'DAY' && detail.includedShiftNames && detail.includedShiftNames.length > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              Shifts included:{' '}
              {detail.includedShiftNames.map(name => (
                <span key={name} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 mr-1">
                  {name}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={onClose}
            className="md:hidden text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Back
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(summary)}
              className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="text-xs text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-400 px-3 py-1.5 rounded-lg transition-colors"
          >
            Print PDF
          </button>
          <IconButton
            onClick={onClose}
            className="hidden md:block text-slate-500 hover:text-slate-600 text-xl leading-none"
            label="Close details"
            icon={'×'}
          />
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Notes */}
        {detail.notes && (
          <div className="ui-card-plain ui-card-muted px-4 py-3 text-sm text-slate-600">
            {detail.notes}
          </div>
        )}

        {/* Cash summary tiles */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Cash & Revenue Summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryTile label="Expected Revenue" value={fmtMoney(detail.totalExpectedRevenue)} />
            <SummaryTile label="Cash Collected" value={fmtMoney(detail.totalCashCollected)} />
            <SummaryTile label="UPI Collected" value={fmtMoney(detail.totalUpiCollected)} />
            <SummaryTile label="Card Collected" value={fmtMoney(detail.totalCardCollected)} />
            <SummaryTile label="Credit Sold" value={fmtMoney(detail.totalCreditSold)} accent="amber" />
            {detail.reportType === 'DAY' && (
              <SummaryTile label="Credit Recovered" value={fmtMoney(detail.totalCreditRecovered)} accent="green" />
            )}
            {detail.reportType === 'DAY' && (detail.totalCashRecovery ?? 0) > 0 && (
              <SummaryTile label="Cash Recovery" value={fmtMoney(detail.totalCashRecovery)} accent="green" sublabel="Short discrepancy repaid" />
            )}
            <SummaryTile
              label="Cash Discrepancy"
              value={fmtMoney(Math.abs(detail.cashDiscrepancy))}
              sublabel={detail.cashDiscrepancy > 0 ? 'Over' : detail.cashDiscrepancy < 0 ? 'Short' : 'Balanced'}
              accent={detail.cashDiscrepancy === 0 ? 'green' : detail.cashDiscrepancy < 0 ? 'red' : 'amber'}
            />
            <SummaryTile label="Total Litres Sold" value={fmtLitres(detail.totalLitresSold)} />
            {detail.reportType === 'DAY' && (
              <SummaryTile label="Litres Delivered" value={fmtLitres(detail.totalLitresDelivered)} />
            )}
            {isOwnerOrAdmin && <SummaryTile label="Cost of Goods" value={fmtMoney(detail.totalCostOfGoods)} />}
            {isOwnerOrAdmin && (
              <SummaryTile
                label={detail.reportType === 'DAY' ? 'Fuel Gross Profit' : 'Gross Profit'}
                value={fmtMoney(detail.totalGrossProfit)}
                accent={detail.totalGrossProfit >= 0 ? 'green' : 'red'}
              />
            )}
            {isOwnerOrAdmin && detail.reportType === 'DAY' && detail.productSales && (
              <SummaryTile
                label="Product Sales Profit"
                value={fmtMoney(detail.productSales.grossProfit)}
                accent={detail.productSales.grossProfit >= 0 ? 'green' : 'red'}
              />
            )}
            {detail.reportType === 'DAY' && detail.expenses && (
              <SummaryTile
                label="Expenses"
                value={'−' + fmtMoney(detail.expenses.totalAmount)}
                accent="red"
              />
            )}
            {isOwnerOrAdmin && detail.dipPlEntries?.length > 0 && (
              <SummaryTile
                label="Dip P/L"
                value={(detail.totalDipNetAmount > 0 ? '+' : '') + fmtMoney(detail.totalDipNetAmount)}
                accent={detail.totalDipNetAmount > 0 ? 'green' : 'red'}
              />
            )}
            {isOwnerOrAdmin && (detail.reportType === 'DAY' ? (
              <SummaryTile
                label="Net Profit"
                value={fmtMoney(detail.totalNetProfit)}
                accent={detail.totalNetProfit >= 0 ? 'green' : 'red'}
              />
            ) : detail.dipPlEntries?.length > 0 && (
              <SummaryTile
                label="Net Profit"
                value={fmtMoney(detail.totalNetProfit)}
                accent={detail.totalNetProfit >= 0 ? 'green' : 'red'}
              />
            ))}
          {isOwnerOrAdmin && detail.linesChangedSinceGenerated && (
            <p className="text-xs text-amber-600 col-span-full mt-1">
              Some dip, product or expense entries changed after this sheet was generated. Totals show the
              values saved at generation; regenerate the sheet to include the changes.
            </p>
          )}
          {!isOwnerOrAdmin && (
            <p className="text-xs text-slate-500 col-span-full mt-1">
              Financial details (cost, profit, P/L) are visible to Owner and Admin only.
            </p>
          )}
          </div>
        </section>

        {/* Fuel lines */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Fuel Breakdown</h3>
          <ScrollRegion label="Fuel summary" className="ui-table-wrap overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[900px] text-sm print:min-w-0 print:text-[8pt]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <Th>Fuel</Th>
                  <Th right>Opening Stock</Th>
                  <Th right>Delivered</Th>
                  <Th right>Sold</Th>
                  <Th right>Closing Stock</Th>
                  <Th right>Selling Price</Th>
                  <Th right>Revenue</Th>
                  {isOwnerOrAdmin && <Th right>COGS</Th>}
                  {isOwnerOrAdmin && <Th right>Profit</Th>}
                  <Th right>Stock Variance</Th>
                  {isOwnerOrAdmin && <Th right>Dip Loss</Th>}
                  <Th right>Credit Sold</Th>
                </tr>
              </thead>
              <tbody>
                {detail.fuelLines.map((line: BsFuelLine) => (
                  <FuelLineRow key={line.fuelType} line={line} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </section>

        {/* Shift lines */}
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Shift Breakdown <span className="text-slate-500 normal-case font-normal">({detail.shiftLines.length} shift{detail.shiftLines.length !== 1 ? 's' : ''})</span>
          </h3>
          <ScrollRegion label="Shift summary" className="ui-table-wrap overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[960px] text-xs print:min-w-0 print:text-[7pt]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <Th>Operator</Th>
                  <Th>DU / Nozzle</Th>
                  <Th>Fuels</Th>
                  <Th right>Litres</Th>
                  <Th right>Expected</Th>
                  <Th right>Received</Th>
                  <Th right>Cash</Th>
                  <Th right>UPI</Th>
                  <Th right>Card</Th>
                  <Th right>Fleet</Th>
                  <Th right>Credit</Th>
                  <Th right>Discrepancy</Th>
                </tr>
              </thead>
              <tbody>
                {detail.shiftLines.map((line: BsShiftLine) => (
                  <ShiftLineRow key={line.shiftId} line={line} />
                ))}
              </tbody>
              {detail.shiftLines.length > 1 && (
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-slate-700 border-t border-slate-200">
                    <Td colSpan={3}>Total</Td>
                    <Td right>{fmtLitres(detail.shiftLines.reduce((s, l) => s + l.litresSold, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.expectedRevenue, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.cashCollected + l.upiCollected + l.cardCollected + (l.fleetCardCollected ?? 0), 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.cashCollected, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.upiCollected, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.cardCollected, 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + (l.fleetCardCollected ?? 0), 0))}</Td>
                    <Td right>{fmtMoney(detail.shiftLines.reduce((s, l) => s + l.creditAmount, 0))}</Td>
                    <DiscrepancyTd value={detail.shiftLines.reduce((s, l) => s + l.discrepancy, 0)} />
                  </tr>
                </tfoot>
              )}
            </table>
          </ScrollRegion>
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
