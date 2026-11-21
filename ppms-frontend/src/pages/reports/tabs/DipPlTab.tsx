import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportApi } from '../../../api/reportApi'
import type { DipPlEntry } from '../../../api/reportApi'
import { Pagination } from '../../../components/Pagination'
import { pageSlice } from '../../../utils/pageSlice'
import { DateRangeInputs, ErrorBox, PrintHeader, SummaryCard } from '../shared'
import { fmtAmt, fmtDateTime, fmtQty, todayIso, yesterdayIso } from '../reportFormat'
import { FUEL_BADGE } from '../../../constants/fuel'
import { ScrollRegion } from '../../../components/ScrollRegion'
import { codeLabel } from '../../../constants/labels'

// ── Dip P/L Tab ───────────────────────────────────────────────────────────────

export function DipPlTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to,   setTo]   = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(() => ({ from: yesterdayIso(), to: todayIso() }))
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<DipPlEntry[]>({
    queryKey: ['report-dip-pl', pumpId, query?.from, query?.to],
    queryFn: () => reportApi.getDipPl(pumpId, query!.from, query!.to),
    enabled: query !== null,
  })

  const entries = data ?? []
  const paged   = data ? pageSlice(entries, page, pageSize) : null

  // Net P/L: sum of all monetaryAmounts (negative = net loss, positive = net gain)
  const netPl    = entries.reduce((s, e) => s + e.monetaryAmount, 0)
  const isNetGain = netPl > 0
  const isNetLoss = netPl < 0

  return (
    <div className="space-y-4">
      <div className="ui-card ui-card-muted p-4 print:hidden">
        <div className="ui-filter-group">
        <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <button
          onClick={() => { setQuery({ from, to }); setPage(0) }}
          disabled={isFetching}
          className="ui-btn ui-btn-primary disabled:bg-blue-300"
        >
          {isFetching ? 'Loading...' : 'Generate'}
        </button>

        <button
          onClick={() => window.print()}
          disabled={!data || entries.length === 0}
          className="ui-btn ui-btn-secondary"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={error.message ?? 'Failed to load dip P/L entries'} />}

      {data && paged && (
        <div className="space-y-4 print:hidden">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label="Total Entries"  value={String(entries.length)}  color="text-slate-700" />
            <SummaryCard
              label="Net P/L"
              value={(isNetGain ? '+' : '') + fmtAmt(netPl)}
              color={isNetGain ? 'text-emerald-600' : isNetLoss ? 'text-red-600' : 'text-slate-500'}
            />
            <SummaryCard
              label="Dip Checks"
              value={String(entries.filter(e => e.type === 'DIP_CHECK').length)}
              color="text-blue-600"
            />
          </div>

          {entries.length === 0 ? (
            <div className="ui-empty py-6">No dip P/L entries found for this date range.</div>
          ) : (
            <>
              <ScrollRegion label="Dip profit and loss entries" className="ui-table-wrap overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Date &amp; Time</th>
                      <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Type</th>
                      <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Fuel</th>
                      <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Litres</th>
                      <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">P/L</th>
                      <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.content.map((e, idx) => {
                      const isGain = e.monetaryAmount > 0
                      const isLoss = e.monetaryAmount < 0
                      const plColor = isGain ? 'text-emerald-600' : isLoss ? 'text-red-600' : 'text-slate-500'
                      const litresColor = e.type === 'DIP_CHECK'
                        ? (e.litres > 0 ? 'text-emerald-600' : e.litres < 0 ? 'text-red-600' : 'text-slate-500')
                        : 'text-slate-700'
                      return (
                        <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2.5 text-slate-600 text-xs">
                            {fmtDateTime(e.recordedAt)}
                          </td>
                          <td className="px-3 py-2.5">
                            {e.type === 'DIP_CHECK' ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Dip Check</span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Maintenance</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${FUEL_BADGE[e.fuelType] ?? 'bg-slate-100 text-slate-600'}`}>
                              {codeLabel(e.fuelType)}
                            </span>
                          </td>
                          <td className={`px-3 py-2.5 text-right font-mono ${litresColor}`}>
                            {e.type === 'DIP_CHECK' && e.litres > 0 ? '+' : ''}{fmtQty(e.litres)}
                          </td>
                          <td className={`px-3 py-2.5 text-right font-medium ${plColor}`}>
                            {isGain ? '+' : ''}{fmtAmt(e.monetaryAmount)}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600 text-xs max-w-[200px] truncate" title={e.notes ?? ''}>
                            {e.notes ?? '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {entries.length > 1 && (
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold border-t border-slate-200 text-slate-700">
                        <td colSpan={4} className="px-3 py-2.5">Net P/L</td>
                        <td className={`px-3 py-2.5 text-right font-medium ${isNetGain ? 'text-emerald-600' : isNetLoss ? 'text-red-600' : 'text-slate-500'}`}>
                          {isNetGain ? '+' : ''}{fmtAmt(netPl)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </ScrollRegion>
              <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
            </>
          )}
        </div>
      )}

      {/* Print: full dataset */}
      {data && entries.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Dip P/L Report" from={query?.from} to={query?.to} />
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Total Entries"  value={String(entries.length)}  color="text-slate-700" />
            <SummaryCard
              label="Net P/L"
              value={(isNetGain ? '+' : '') + fmtAmt(netPl)}
              color={isNetGain ? 'text-emerald-600' : isNetLoss ? 'text-red-600' : 'text-slate-500'}
            />
            <SummaryCard
              label="Dip Checks"
              value={String(entries.filter(e => e.type === 'DIP_CHECK').length)}
              color="text-blue-600"
            />
          </div>
          <ScrollRegion label="Dip profit and loss summary" className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Date &amp; Time</th>
                <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Type</th>
                <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Fuel</th>
                <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Litres</th>
                <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">P/L</th>
                <th scope="col" className="px-3 py-2.5 text-xs font-semibold text-slate-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => {
                const isGain = e.monetaryAmount > 0
                const isLoss = e.monetaryAmount < 0
                const plColor = isGain ? 'text-emerald-600' : isLoss ? 'text-red-600' : 'text-slate-500'
                const litresColor = e.type === 'DIP_CHECK'
                  ? (e.litres > 0 ? 'text-emerald-600' : e.litres < 0 ? 'text-red-600' : 'text-slate-500')
                  : 'text-slate-700'
                return (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-600 text-xs">
                      {fmtDateTime(e.recordedAt)}
                    </td>
                    <td className="px-3 py-2">
                      {e.type === 'DIP_CHECK'
                        ? <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Dip Check</span>
                        : <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Maintenance</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${FUEL_BADGE[e.fuelType] ?? 'bg-slate-100 text-slate-600'}`}>
                        {codeLabel(e.fuelType)}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${litresColor}`}>
                      {e.type === 'DIP_CHECK' && e.litres > 0 ? '+' : ''}{fmtQty(e.litres)}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${plColor}`}>
                      {isGain ? '+' : ''}{fmtAmt(e.monetaryAmount)}
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{e.notes ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            {entries.length > 1 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold border-t border-slate-200 text-slate-700">
                  <td colSpan={4} className="px-3 py-2.5">Net P/L</td>
                  <td className={`px-3 py-2.5 text-right font-medium ${isNetGain ? 'text-emerald-600' : isNetLoss ? 'text-red-600' : 'text-slate-500'}`}>
                    {isNetGain ? '+' : ''}{fmtAmt(netPl)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          </ScrollRegion>
        </div>
      )}
    </div>
  )
}
