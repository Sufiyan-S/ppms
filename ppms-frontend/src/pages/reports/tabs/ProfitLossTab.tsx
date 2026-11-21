import { Fragment, useState } from 'react'
import { withToggled } from '../../../utils/setToggle'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { reportApi } from '../../../api/reportApi'
import type { ProfitLossReport } from '../../../api/reportApi'
import { Pagination } from '../../../components/Pagination'
import { pageSlice } from '../../../utils/pageSlice'
import { DateRangeInputs, ErrorBox, PrintHeader, SummaryCard } from '../shared'
import { fmtAmt, fmtQty, fmtShortDate, todayIso, yesterdayIso } from '../reportFormat'
import { ScrollRegion } from '../../../components/ScrollRegion'
import { codeLabel } from '../../../constants/labels'

// ── P&L Tab ───────────────────────────────────────────────────────────────────

export function ProfitLossTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to,   setTo]   = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(() => ({ from: yesterdayIso(), to: todayIso() }))
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [showRevBreakdown, setShowRevBreakdown] = useState(false)
  const [expandedFuelRows, setExpandedFuelRows] = useState<Set<string>>(new Set())

  function toggleFuelRow(fuelType: string) {
    setExpandedFuelRows(prev => withToggled(prev, fuelType))
  }

  const { data, isFetching, error } = useQuery<ProfitLossReport>({
    queryKey: ['report-pl', pumpId, query?.from, query?.to],
    queryFn: () => reportApi.getProfitLoss(pumpId, query!.from, query!.to),
    enabled: !!query,
  })

  const paged = data ? pageSlice(data.byFuelType, page, pageSize) : null

  return (
    <div className="space-y-4">
      {/* Screen: controls */}
      <div className="ui-card ui-card-muted p-4 print:hidden">
        <div className="ui-filter-group">
          <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          <button
            onClick={() => { setQuery({ from, to }); setPage(0) }}
            disabled={isFetching}
            className="ui-btn ui-btn-primary"
          >
            {isFetching ? 'Loading…' : 'Generate'}
          </button>
          <button
            onClick={() => window.print()}
            disabled={!data || data.byFuelType.length === 0}
            className="ui-btn ui-btn-secondary"
          >
            Print PDF
          </button>
        </div>
      </div>

      {error && <ErrorBox message={serverMessage(error) ?? 'Failed to load report'} />}

      {/* Screen: paginated data */}
      {data && paged && (
        <div className="space-y-4 print:hidden">
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Revenue" value={fmtAmt(data.totalRevenue)} color="text-slate-800" />
            <SummaryCard label="Cost of Goods" value={fmtAmt(data.totalCogs)}    color="text-red-600" />
            <SummaryCard label="Gross Profit"  value={fmtAmt(data.grossProfit)}  color={data.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'} />
          </div>

          {/* Revenue breakdown toggle */}
          <div className="ui-card ui-card-muted p-3">
            <button
              onClick={() => setShowRevBreakdown(v => !v)}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {showRevBreakdown
                ? <ChevronUp size={14} strokeWidth={2} />
                : <ChevronDown size={14} strokeWidth={2} />}
              Revenue breakdown (Cash / UPI / Card / Credit)
            </button>
            {showRevBreakdown && (
              <div className="grid grid-cols-4 gap-3 mt-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cash</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{fmtAmt(data.totalCashRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">UPI</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{fmtAmt(data.totalUpiRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Card</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">{fmtAmt(data.totalCardRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Credit Sales</p>
                  <p className="text-sm font-semibold text-orange-600 mt-0.5">{fmtAmt(data.totalCreditRevenue)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Per-fuel table with drilldown */}
          <div className="ui-table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th scope="col" className="w-6 px-2 py-2.5" />
                  <th scope="col" className="text-left px-4 py-2.5 font-medium">Fuel Type</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">Revenue</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">COGS</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">Gross Profit</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">₹/L Margin</th>
                </tr>
              </thead>
              <tbody>
                {paged.content.map((row) => (
                  <Fragment key={row.fuelType}>
                    <tr
                      className="border-t border-slate-100 cursor-pointer hover:bg-slate-50/60"
                      onClick={() => toggleFuelRow(row.fuelType)}
                    >
                      <td className="px-2 py-2.5 text-slate-500">
                        <button
                          type="button"
                          aria-expanded={expandedFuelRows.has(row.fuelType)}
                          aria-label={`Show shift details for ${codeLabel(row.fuelType)}`}
                          onClick={(e) => { e.stopPropagation(); toggleFuelRow(row.fuelType) }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md"
                        >
                          {expandedFuelRows.has(row.fuelType)
                            ? <ChevronUp size={13} strokeWidth={2} aria-hidden="true" />
                            : <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{codeLabel(row.fuelType)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{fmtAmt(row.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-red-600 tabular-nums">{fmtAmt(row.cogs)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${row.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {fmtAmt(row.grossProfit)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs tabular-nums">
                        {row.grossMarginPerLitre != null ? `₹${row.grossMarginPerLitre.toFixed(2)}/L` : '—'}
                      </td>
                    </tr>
                    {expandedFuelRows.has(row.fuelType) && row.lotCostLines.length > 0 && (
                      <tr key={`${row.fuelType}-lots`} className="bg-blue-50/40">
                        <td />
                        <td colSpan={5} className="px-4 pb-3 pt-1">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="text-slate-500 font-semibold">
                                <th scope="col" className="text-left py-1.5 pr-3">Lot Ref</th>
                                <th scope="col" className="text-left py-1.5 pr-3">Delivery Date</th>
                                <th scope="col" className="text-right py-1.5 pr-3">Cost/L</th>
                                <th scope="col" className="text-right py-1.5 pr-3">Units Consumed</th>
                                <th scope="col" className="text-right py-1.5">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.lotCostLines.map((lot) => (
                                <tr key={lot.lotId} className="border-t border-blue-100">
                                  <td className="py-1.5 pr-3 text-slate-600">{lot.tankerReference}</td>
                                  <td className="py-1.5 pr-3 text-slate-500">{fmtShortDate(lot.deliveryDate)}</td>
                                  <td className="py-1.5 pr-3 text-right text-slate-600">₹{lot.costPricePerUnit.toFixed(2)}</td>
                                  <td className="py-1.5 pr-3 text-right text-slate-600">{fmtQty(lot.quantityConsumed)}</td>
                                  <td className="py-1.5 text-right font-medium text-slate-700">{fmtAmt(lot.lotCost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gross Profit reflects fuel sales only. Operating expenses (salaries, maintenance) are excluded.
          </p>
          <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
          <p className="text-xs text-slate-500">{data.totalShifts} closed shift{data.totalShifts !== 1 ? 's' : ''} in range.</p>
        </div>
      )}

      {/* Print: full dataset */}
      {data && data.byFuelType.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Profit & Loss Report" from={query?.from} to={query?.to} />
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Revenue" value={fmtAmt(data.totalRevenue)} color="text-slate-800" />
            <SummaryCard label="Cost of Goods" value={fmtAmt(data.totalCogs)}    color="text-red-600" />
            <SummaryCard label="Gross Profit"  value={fmtAmt(data.grossProfit)}  color={data.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'} />
          </div>
          {/* Revenue breakdown — always expanded in print */}
          <div className="grid grid-cols-4 gap-3 mb-2">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Cash</p>
              <p className="text-sm font-semibold text-slate-700">{fmtAmt(data.totalCashRevenue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold">UPI</p>
              <p className="text-sm font-semibold text-slate-700">{fmtAmt(data.totalUpiRevenue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Card</p>
              <p className="text-sm font-semibold text-slate-700">{fmtAmt(data.totalCardRevenue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-semibold">Credit Sales</p>
              <p className="text-sm font-semibold text-orange-600">{fmtAmt(data.totalCreditRevenue)}</p>
            </div>
          </div>
          <ScrollRegion label="Profit and loss by fuel" className="ui-card p-0 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th scope="col" className="text-left px-4 py-2.5 font-medium">Fuel Type</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">Revenue</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">COGS</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">Gross Profit</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">₹/L Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.byFuelType.map((row) => (
                  <Fragment key={row.fuelType}>
                    <tr className="border-t border-slate-100">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{codeLabel(row.fuelType)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">{fmtAmt(row.revenue)}</td>
                      <td className="px-4 py-2.5 text-right text-red-600 tabular-nums">{fmtAmt(row.cogs)}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${row.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtAmt(row.grossProfit)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 text-xs tabular-nums">
                        {row.grossMarginPerLitre != null ? `₹${row.grossMarginPerLitre.toFixed(2)}/L` : '—'}
                      </td>
                    </tr>
                    {row.lotCostLines.length > 0 && (
                      <tr key={`${row.fuelType}-lots`}>
                        <td colSpan={5} className="px-6 pb-2">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="text-slate-500 font-semibold">
                                <th scope="col" className="text-left py-1 pr-3">Lot Ref</th>
                                <th scope="col" className="text-left py-1 pr-3">Delivery Date</th>
                                <th scope="col" className="text-right py-1 pr-3">Cost/L</th>
                                <th scope="col" className="text-right py-1 pr-3">Units</th>
                                <th scope="col" className="text-right py-1">Cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.lotCostLines.map((lot) => (
                                <tr key={lot.lotId} className="border-t border-slate-100">
                                  <td className="py-1 pr-3 text-slate-600">{lot.tankerReference}</td>
                                  <td className="py-1 pr-3 text-slate-500">{fmtShortDate(lot.deliveryDate)}</td>
                                  <td className="py-1 pr-3 text-right text-slate-600">₹{lot.costPricePerUnit.toFixed(2)}</td>
                                  <td className="py-1 pr-3 text-right text-slate-600">{fmtQty(lot.quantityConsumed)}</td>
                                  <td className="py-1 text-right font-medium text-slate-700">{fmtAmt(lot.lotCost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <p className="text-xs text-slate-500 mt-1">
            Gross Profit reflects fuel sales only. Operating expenses (salaries, maintenance) are excluded.
          </p>
          <p className="text-xs text-slate-500">{data.totalShifts} closed shift{data.totalShifts !== 1 ? 's' : ''} in range.</p>
        </div>
      )}
    </div>
  )
}
