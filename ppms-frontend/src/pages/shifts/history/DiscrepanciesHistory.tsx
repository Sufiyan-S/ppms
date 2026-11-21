import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { shiftApi } from '../../../api/shiftApi'
import { SkeletonRows } from '../../../components/Skeleton'
import { parseApiError } from '../../../utils/apiError'
import { PAGE_SIZE, fmtAmt, RESOLUTION_LABELS } from '../shiftLabels'
import { ScrollRegion } from '../../../components/ScrollRegion'
import { FULL_HISTORY_QUERY_OPTIONS } from '../../../queryClient'

export function DiscrepanciesHistory({ pumpId }: { pumpId: number }) {
  const [page,     setPage]     = useState(0)
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'SHORT' | 'OVER'>('ALL')

  const { data: filtered = [], isLoading, error } = useQuery({
    queryKey: ['shiftHistory', pumpId, 'discrepancies', fromDate, toDate, typeFilter],
    queryFn:  () => shiftApi.getShiftHistory(pumpId, {
      from: fromDate || undefined,
      to: toDate || undefined,
      discrepanciesOnly: true,
      discrepancyType: typeFilter === 'ALL' ? undefined : typeFilter,
    }),
    ...FULL_HISTORY_QUERY_OPTIONS,
  })
  const hasFilter = !!fromDate || !!toDate || typeFilter !== 'ALL'

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages - 1)
  const paged      = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const clearFilter = () => { setFromDate(''); setToDate(''); setTypeFilter('ALL'); setPage(0) }

  const totalShort = filtered.filter(s => s.discrepancyType === 'SHORT').reduce((sum, s) => sum + (s.discrepancyAmount ?? 0), 0)
  const totalOver  = filtered.filter(s => s.discrepancyType === 'OVER').reduce((sum, s) => sum + (s.discrepancyAmount ?? 0), 0)
  const resolved   = filtered.filter(s => s.discrepancyResolution && s.discrepancyResolution !== 'PENDING_INVESTIGATION').length
  const cashRecovered = filtered.filter(s => s.discrepancyResolution === 'CASH_RECOVERY').reduce((sum, s) => sum + (s.cashRecoveryAmount ?? 0), 0)

  if (isLoading) return <div className="px-5 py-4"><SkeletonRows count={4} /></div>
  if (error) return <p role="alert" className="ui-alert ui-alert-error m-4 text-sm">{parseApiError(error, 'Failed to load discrepancies')}</p>
  if (filtered.length === 0 && !hasFilter) {
    return <div className="ui-empty p-6">No discrepancies recorded yet.</div>
  }

  return (
    <div>
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 px-6 py-3 border-t border-slate-100 bg-red-50/40">
        <div className="text-xs">
          <span className="text-slate-500">SHORT total: </span>
          <span className="font-semibold text-red-700">{fmtAmt(totalShort)}</span>
        </div>
        <div className="text-xs">
          <span className="text-slate-500">OVER total: </span>
          <span className="font-semibold text-amber-700">{fmtAmt(totalOver)}</span>
        </div>
        <div className="text-xs">
          <span className="text-slate-500">Resolved: </span>
          <span className="font-semibold text-slate-700">{resolved} / {filtered.length}</span>
        </div>
        {cashRecovered > 0 && (
          <div className="text-xs">
            <span className="text-slate-500">Cash recovered: </span>
            <span className="font-semibold text-green-700">{fmtAmt(cashRecovered)}</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-t border-slate-100 bg-slate-50/60">
        <span className="text-xs font-medium text-slate-500">Filter:</span>
        <div className="flex items-center gap-2">
          <input aria-label="From date"
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(0) }}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-500 text-xs">to</span>
          <input aria-label="To date"
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(0) }}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['ALL', 'SHORT', 'OVER'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setPage(0) }}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                typeFilter === t
                  ? t === 'SHORT' ? 'bg-red-600 border-red-600 text-white'
                    : t === 'OVER' ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {(fromDate || toDate || typeFilter !== 'ALL') && (
          <button onClick={clearFilter} className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-slate-500 hover:text-slate-700 underline">
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">{filtered.length} shift{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <ScrollRegion label="Discrepancies" className="overflow-x-auto border-t border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th scope="col" className="text-left px-5 py-3 font-medium hidden md:table-cell">ID</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Date</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Operator</th>
              <th scope="col" className="text-left px-5 py-3 font-medium hidden md:table-cell">DU</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Type</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Amount</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Resolution</th>
              <th scope="col" className="text-left px-5 py-3 font-medium hidden md:table-cell">Note</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={8} className="ui-empty px-6 py-6">No discrepancies match the selected filters.</td>
              </tr>
            ) : (
              paged.map((shift) => (
                <tr key={shift.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3 text-slate-500 text-xs font-mono hidden md:table-cell">{shift.id}</td>
                  <td className="px-5 py-3 text-xs text-slate-600">{shift.shiftDate}</td>
                  <td className="px-5 py-3 text-sm text-slate-700 font-medium">{shift.operatorName}</td>
                  <td className="px-5 py-3 text-xs text-slate-500 hidden md:table-cell">
                    {shift.duName ?? `DU #${shift.duNumber}`}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      shift.discrepancyType === 'SHORT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {shift.discrepancyType}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold">
                    <span className={shift.discrepancyType === 'SHORT' ? 'text-red-700' : 'text-amber-700'}>
                      {fmtAmt(shift.discrepancyAmount)}
                    </span>
                    {shift.cashRecoveryAmount != null && shift.cashRecoveryAmount > 0 && (
                      <span className="block text-xs text-green-600 font-normal mt-0.5">
                        Recovered: {fmtAmt(shift.cashRecoveryAmount)}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {shift.discrepancyResolution ? (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        shift.discrepancyResolution === 'CASH_RECOVERY'   ? 'bg-green-100 text-green-700' :
                        shift.discrepancyResolution === 'SALARY_DEDUCTION'? 'bg-blue-100 text-blue-700' :
                        shift.discrepancyResolution === 'WAIVED'          ? 'bg-slate-100 text-slate-600' :
                                                                            'bg-orange-100 text-orange-700'
                      }`}>
                        {RESOLUTION_LABELS[shift.discrepancyResolution] ?? shift.discrepancyResolution}
                      </span>
                    ) : (
                      <span className="text-xs text-orange-600 font-medium">Pending</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500 hidden md:table-cell max-w-xs truncate">
                    {shift.discrepancyResolutionNote ?? shift.discrepancyReason ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollRegion>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/60">
          <span className="text-xs text-slate-500">
            Page {safePage + 1} of {totalPages}
            <span className="ml-2 text-slate-500">
              (showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length})
            </span>
          </span>
          <div className="flex gap-1">
            <button aria-label="First page" onClick={() => setPage(0)} disabled={safePage === 0} className="ui-btn ui-btn-secondary min-h-0 px-2.5 py-1 text-xs disabled:opacity-30">«</button>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="ui-btn ui-btn-secondary min-h-0 px-3 py-1 text-xs disabled:opacity-30">Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i)
              .filter((i) => Math.abs(i - safePage) <= 2)
              .map((i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`ui-btn min-h-0 px-3 py-1 text-xs rounded-md border transition-colors ${
                    i === safePage ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1} className="ui-btn ui-btn-secondary min-h-0 px-3 py-1 text-xs disabled:opacity-30">Next</button>
            <button aria-label="Last page" onClick={() => setPage(totalPages - 1)} disabled={safePage === totalPages - 1} className="ui-btn ui-btn-secondary min-h-0 px-2.5 py-1 text-xs disabled:opacity-30">»</button>
          </div>
        </div>
      )}
    </div>
  )
}
