import { useState } from 'react'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { reportApi } from '../../../api/reportApi'
import { pumpApi } from '../../../api/pumpApi'
import type { InventoryLotsReport, AllTanksInventoryReport } from '../../../api/reportApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Pagination } from '../../../components/Pagination'
import { pageSlice } from '../../../utils/pageSlice'
import { DateRangeInputs, ErrorBox, PrintHeader } from '../shared'
import { localDateInputValue } from '../../../utils/date'
import { fmtAmt, fmtQty, fmtShortDate, fmtShortDayMonth } from '../reportFormat'
import { codeLabel } from '../../../constants/labels'

const ALL_TANKS_DEFAULT_DAYS = 90

// ── Inventory Lots Tab ────────────────────────────────────────────────────────

export function InventoryLotsTab({ pumpId }: { pumpId: number }) {
  const [tankId, setTankId] = useState<string>('')    // '' = All Tanks, '123' = specific tank id
  const [query,  setQuery]  = useState<string>('')    // mirrors tankId on Load click
  const [from, setFrom] = useState(() => localDateInputValue(-(ALL_TANKS_DEFAULT_DAYS - 1)))
  const [to,   setTo]   = useState(() => localDateInputValue())
  const [range, setRange] = useState({ from, to })    // mirrors from/to on Load click
  const [expandedLot, setExpandedLot] = useState<number | null>(null)

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

  return (
    <div className="space-y-4">
      <div className="ui-card ui-card-muted p-4 print:hidden">
        <div className="ui-filter-group">
          <div className="w-56">
            <span className="ui-label">Tank</span>
            <SearchableSelect label="Tank"
              value={tankId}
              onChange={(v) => setTankId(v ?? '')}
              options={[
                { value: '', label: 'All Tanks' },
                ...tanks.map(t => ({ value: String(t.id), label: `${t.tankIdentifier} (${t.fuelType})` })),
              ]}
              placeholder="Select tank…"
            />
          </div>
          {tankId === '' && <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} />}
          <button
            onClick={() => { setQuery(tankId); setRange({ from, to }); setPage(0) }}
            disabled={isFetching}
            className="ui-btn ui-btn-primary"
          >
            {isFetching ? 'Loading…' : 'Load Lots'}
          </button>
          <button
            onClick={() => window.print()}
            disabled={!data || data.lots.length === 0}
            className="ui-btn ui-btn-secondary"
          >
            Print PDF
          </button>
        </div>
      </div>

      {query === '' && (
        <p className="ui-help print:hidden">
          Showing every active lot, plus used-up lots delivered between {fmtShortDate(range.from)} and {fmtShortDate(range.to)}.
        </p>
      )}

      {error && <ErrorBox message={serverMessage(error) ?? 'Failed to load report'} />}

      {/* Single-tank view */}
      {data && paged && query !== '' && (
        <div className="space-y-3 print:hidden">
          {/* Summary strip */}
          {data.weightedAvgCostPerUnit != null && (
            <div className="grid grid-cols-3 gap-3">
              <div className="ui-card ui-card-muted p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Remaining</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5">{fmtQty(data.totalRemaining)}</p>
              </div>
              <div className="ui-card ui-card-muted p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Avg Cost</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5">₹{data.weightedAvgCostPerUnit.toFixed(2)}/L</p>
              </div>
              <div className="ui-card ui-card-muted p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Stock Value</p>
                <p className="text-sm font-semibold text-slate-700 mt-0.5">{fmtAmt(data.totalStockValue)}</p>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500">{data.totalLots} lot{data.totalLots !== 1 ? 's' : ''} in this tank.</p>
          {paged.content.map((lot) => (
            <div key={lot.lotId} className="ui-card p-0 overflow-hidden">
              <button
                className="ui-accordion-trigger"
                onClick={() => setExpandedLot(expandedLot === lot.lotId ? null : lot.lotId)}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    lot.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>{codeLabel(lot.status)}</span>
                  {lot.isDipAdjustment && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">DIP Adj.</span>
                  )}
                  <span className="text-sm font-medium text-slate-700">{fmtShortDate(lot.deliveryDate)}</span>
                  <span className="text-xs text-slate-500">{codeLabel(lot.fuelType)}</span>
                  <span className="text-xs text-slate-500">{lot.tankerReference}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>₹{lot.costPricePerUnit}/L</span>
                  <span>{fmtQty(lot.remainingQuantity)} remaining</span>
                  <span>{fmtAmt(lot.totalCogsConsumed)} COGS</span>
                  {expandedLot === lot.lotId
                    ? <ChevronUp size={14} strokeWidth={2} className="text-slate-500" />
                    : <ChevronDown size={14} strokeWidth={2} className="text-slate-500" />
                  }
                </div>
              </button>
              {expandedLot === lot.lotId && lot.consumptions.length > 0 && (
                <table className="w-full text-xs border-t border-slate-100">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th scope="col" className="text-left px-4 py-2 font-medium">Tanker Ref</th>
                      <th scope="col" className="text-left px-4 py-2 font-medium">Date</th>
                      <th scope="col" className="text-left px-4 py-2 font-medium">Source</th>
                      <th scope="col" className="text-left px-4 py-2 font-medium">Shift</th>
                      <th scope="col" className="text-right px-4 py-2 font-medium">Qty (L)</th>
                      <th scope="col" className="text-right px-4 py-2 font-medium">Cost/L</th>
                      <th scope="col" className="text-right px-4 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lot.consumptions.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-600 text-xs font-medium">{lot.tankerReference}</td>
                        <td className="px-4 py-2 text-slate-500">{fmtShortDayMonth(c.consumedAt)}</td>
                        <td className="px-4 py-2 text-slate-500">{codeLabel(c.sourceType)}</td>
                        <td className="px-4 py-2 text-slate-500">{c.shiftName ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-slate-700">
                          {c.quantityConsumed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">₹{c.costPricePerUnit}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-700">{fmtAmt(c.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {expandedLot === lot.lotId && lot.consumptions.length === 0 && (
                <p className="ui-empty border-t border-slate-100 px-4 py-3">No consumptions yet.</p>
              )}
            </div>
          ))}
          {paged.content.length === 0 && (
            <div className="ui-empty py-6">No inventory lots found for this tank.</div>
          )}
          <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}

      {/* All-tanks view */}
      {allTanksData && query === '' && (
        <div className="space-y-3 print:hidden">
          {allTanksData.tanks.length === 0 ? (
            <div className="ui-empty py-6">No tanks configured for this pump.</div>
          ) : (
            <>
              {allTanksData.tanks.map((section) => (
                <div key={section.tankId} className="ui-card p-0 overflow-hidden">
                  <button
                    className="ui-accordion-trigger"
                    onClick={() => setExpandedLot(expandedLot === section.tankId ? null : section.tankId)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-700">{section.tankIdentifier}</span>
                      <span className="text-xs text-slate-500">{codeLabel(section.fuelType)}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{section.lotCount} lots</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>{fmtQty(section.totalRemaining)} remaining</span>
                      {section.weightedAvgCostPerUnit != null && (
                        <span>₹{section.weightedAvgCostPerUnit.toFixed(2)}/L avg</span>
                      )}
                      <span>{fmtAmt(section.totalStockValue)} value</span>
                      {expandedLot === section.tankId
                        ? <ChevronUp size={14} strokeWidth={2} className="text-slate-500" />
                        : <ChevronDown size={14} strokeWidth={2} className="text-slate-500" />}
                    </div>
                  </button>
                  {expandedLot === section.tankId && (
                    <div className="p-4 border-t border-slate-100">
                      {section.lots.length === 0 ? (
                        <p className="ui-empty">No lots in this tank.</p>
                      ) : (
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500">
                              <th scope="col" className="text-left px-3 py-2 font-medium">Tanker Ref</th>
                              <th scope="col" className="text-left px-3 py-2 font-medium">Delivery Date</th>
                              <th scope="col" className="text-right px-3 py-2 font-medium">Cost/L</th>
                              <th scope="col" className="text-right px-3 py-2 font-medium">Original</th>
                              <th scope="col" className="text-right px-3 py-2 font-medium">Remaining</th>
                              <th scope="col" className="text-left px-3 py-2 font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.lots.map((lot) => (
                              <tr key={lot.lotId} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-600">{lot.tankerReference}</td>
                                <td className="px-3 py-2 text-slate-500">{fmtShortDate(lot.deliveryDate)}</td>
                                <td className="px-3 py-2 text-right text-slate-600">₹{lot.costPricePerUnit.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right text-slate-500">{fmtQty(lot.originalQuantity)}</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-700">{fmtQty(lot.remainingQuantity)}</td>
                                <td className="px-3 py-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    lot.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                                  }`}>{codeLabel(lot.status)}</span>
                                  {lot.isDipAdjustment && (
                                    <span className="ml-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">DIP</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Cross-tank summary */}
              <div className="ui-card p-4 overflow-x-auto">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Cross-Tank Summary</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500">
                      <th scope="col" className="text-left px-3 py-2 font-medium">Fuel Type</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Total Remaining</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Weighted Avg Cost</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Total Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTanksData.crossTankSummary.map((row) => (
                      <tr key={row.fuelType} className="border-t border-slate-100">
                        <td className="px-3 py-2.5 font-medium text-slate-700">{codeLabel(row.fuelType)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{fmtQty(row.totalRemaining)}</td>
                        <td className="px-3 py-2.5 text-right text-slate-600">
                          {row.weightedAvgCostPerUnit != null ? `₹${row.weightedAvgCostPerUnit.toFixed(2)}/L` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{fmtAmt(row.totalStockValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Print: single-tank full dataset */}
      {data && data.lots.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Inventory Lots Report" />
          <p className="text-xs text-slate-500 mb-2">{data.totalLots} lot{data.totalLots !== 1 ? 's' : ''} in this tank.</p>
          {data.lots.map((lot) => (
            <div key={lot.lotId} className="mb-4">
              <div className="flex items-center gap-3 mb-1 pb-1 border-b border-slate-200 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lot.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{codeLabel(lot.status)}</span>
                {lot.isDipAdjustment && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">DIP Adj.</span>}
                <span className="text-sm font-medium text-slate-700">{fmtShortDate(lot.deliveryDate)}</span>
                <span className="text-xs text-slate-500">{codeLabel(lot.fuelType)}</span>
                <span className="text-xs text-slate-500">{lot.tankerReference}</span>
                <span className="text-xs text-slate-500">₹{lot.costPricePerUnit}/L</span>
                <span className="text-xs text-slate-500">{fmtQty(lot.remainingQuantity)} remaining</span>
                <span className="text-xs text-slate-500">{fmtAmt(lot.totalCogsConsumed)} COGS</span>
              </div>
              {lot.consumptions.length > 0 ? (
                <table className="w-full text-xs border border-slate-100">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th scope="col" className="text-left px-3 py-2 font-medium">Tanker Ref</th>
                      <th scope="col" className="text-left px-3 py-2 font-medium">Date</th>
                      <th scope="col" className="text-left px-3 py-2 font-medium">Source</th>
                      <th scope="col" className="text-left px-3 py-2 font-medium">Shift</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Qty (L)</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Cost/L</th>
                      <th scope="col" className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lot.consumptions.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-600">{lot.tankerReference}</td>
                        <td className="px-3 py-1.5 text-slate-500">{fmtShortDayMonth(c.consumedAt)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{codeLabel(c.sourceType)}</td>
                        <td className="px-3 py-1.5 text-slate-500">{c.shiftName ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{c.quantityConsumed.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600">₹{c.costPricePerUnit}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-700">{fmtAmt(c.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="ui-empty px-3 py-2">No consumptions yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
