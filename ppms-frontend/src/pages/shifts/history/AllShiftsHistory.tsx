import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { shiftApi } from '../../../api/shiftApi'
import { SkeletonRows } from '../../../components/Skeleton'
import { localDateInputValue } from '../../../utils/date'
import { parseApiError } from '../../../utils/apiError'
import { HistoryRow } from './HistoryRow'
import { PAGE_SIZE } from '../shiftLabels'
import { ScrollRegion } from '../../../components/ScrollRegion'

// ── All Shifts (paginated + date range filter) ────────────────────────────────

export function AllShiftsHistory({ pumpId }: { pumpId: number }) {
  const [page,     setPage]     = useState(0)
  const [fromDate, setFromDate] = useState(() => localDateInputValue(-1))
  const [toDate,   setToDate]   = useState(() => localDateInputValue())

  const { data, isLoading, error } = useQuery({
    queryKey: ['shiftHistory', pumpId, 'all', fromDate, toDate, page],
    queryFn:  () => shiftApi.getShiftHistoryPage(pumpId, { from: fromDate || undefined, to: toDate || undefined }, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  })

  const paged         = data?.content ?? []
  const totalElements = data?.page.totalElements ?? 0
  const totalPages    = Math.max(1, data?.page.totalPages ?? 1)
  const safePage      = Math.min(page, totalPages - 1)

  const clearFilter = () => { setFromDate(''); setToDate(''); setPage(0) }

  return (
    <div>
      {/* Date range filter bar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-t border-slate-100 bg-slate-50/60">
        <span className="text-xs font-medium text-slate-500">Filter by date:</span>
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
        {(fromDate || toDate) && (
          <button
            onClick={clearFilter}
            className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {totalElements} shift{totalElements !== 1 ? 's' : ''}
          {(fromDate || toDate) ? ' (filtered)' : ''}
        </span>
      </div>

      {/* Table */}
      <ScrollRegion label="All shifts" className="overflow-x-auto border-t border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th scope="col" className="text-left px-5 py-3 font-medium hidden md:table-cell">ID</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Nozzle</th>
              <th scope="col" className="text-left px-5 py-3 font-medium hidden md:table-cell">Shift</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Operator</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Date</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Amount Due</th>
              <th scope="col" className="text-left px-5 py-3 font-medium">Status</th>
              <th scope="col" className="text-left px-5 py-3 font-medium hidden md:table-cell">Discrepancy</th>
              <th scope="col" className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-5 py-4"><SkeletonRows count={4} /></td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className="px-6 py-4">
                  <p role="alert" className="ui-alert ui-alert-error text-sm">{parseApiError(error, 'Failed to load shift history')}</p>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={9} className="ui-empty px-6 py-6">
                  No shifts match the selected date range.
                </td>
              </tr>
            ) : (
              paged.map((shift) => <HistoryRow key={shift.id} shift={shift} />)
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
              (showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, totalElements)} of {totalElements})
            </span>
          </span>
          <div className="flex gap-1">
            <button aria-label="First page"
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="ui-btn ui-btn-secondary min-h-0 px-2.5 py-1 text-xs disabled:opacity-30"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="ui-btn ui-btn-secondary min-h-0 px-3 py-1 text-xs disabled:opacity-30"
            >
              Prev
            </button>
            {/* Page number pills — show window of 5 */}
            {Array.from({ length: totalPages }, (_, i) => i)
              .filter((i) => Math.abs(i - safePage) <= 2)
              .map((i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`ui-btn min-h-0 px-3 py-1 text-xs rounded-md border transition-colors ${
                    i === safePage
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-200 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
              className="ui-btn ui-btn-secondary min-h-0 px-3 py-1 text-xs disabled:opacity-30"
            >
              Next
            </button>
            <button aria-label="Last page"
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage === totalPages - 1}
              className="ui-btn ui-btn-secondary min-h-0 px-2.5 py-1 text-xs disabled:opacity-30"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
