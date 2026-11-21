import { useState } from 'react'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { reportApi } from '../../../api/reportApi'
import type { ExpenseReportLine } from '../../../api/reportApi'
import { Pagination } from '../../../components/Pagination'
import { pageSlice } from '../../../utils/pageSlice'
import { DateRangeInputs, ErrorBox, PrintHeader, SummaryCard } from '../shared'
import { fmtAmt, todayIso, yesterdayIso } from '../reportFormat'
import { codeLabel } from '../../../constants/labels'

// ── Expenses Tab ──────────────────────────────────────────────────────────────

export function ExpensesTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to, setTo]     = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(() => ({ from: yesterdayIso(), to: todayIso() }))
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<ExpenseReportLine[]>({
    queryKey: ['report-expenses', pumpId, query?.from, query?.to],
    queryFn:  () => reportApi.getExpensesReport(pumpId, query!.from, query!.to),
    enabled:  !!query,
  })

  const rows  = data ?? []
  const paged = data ? pageSlice(rows, page, pageSize) : null
  const total = rows
    .filter(e => e.approvalStatus === 'APPROVED')
    .reduce((sum, e) => sum + e.amount, 0)
  const pendingTotal = rows
    .filter(e => e.approvalStatus === 'PENDING_APPROVAL')
    .reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="space-y-4">
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
          disabled={rows.length === 0}
          className="ui-btn ui-btn-secondary"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={serverMessage(error) ?? 'Failed to load report'} />}

      {/* Screen: paginated data */}
      {data && paged && (
        rows.length === 0 ? (
          <p className="ui-empty py-4 print:hidden">No expenses in this date range.</p>
        ) : (
          <div className="space-y-3 print:hidden">
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard label="Approved Expenses" value={fmtAmt(total)} color="text-red-600" />
              <SummaryCard label="Pending Approval" value={fmtAmt(pendingTotal)} color="text-amber-600" />
            </div>
            <div className="ui-table-wrap">
              <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th scope="col" className="text-left px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="text-left px-4 py-2.5 font-medium">Category</th>
                  <th scope="col" className="text-left px-4 py-2.5 font-medium">Description</th>
                  <th scope="col" className="text-right px-4 py-2.5 font-medium">Amount</th>
                  <th scope="col" className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.content.map(e => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-600">{e.expenseDate}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{codeLabel(e.category)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{e.description}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-red-600">{fmtAmt(e.amount)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{codeLabel(e.approvalStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
            <p className="text-xs text-slate-500">{rows.length} expense{rows.length !== 1 ? 's' : ''} in range.</p>
          </div>
        )
      )}

      {/* Print: full dataset */}
      {data && rows.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Expenses Report" from={query?.from} to={query?.to} />
          <SummaryCard label="Approved Expenses" value={fmtAmt(total)} color="text-red-600" />
          <SummaryCard label="Pending Approval" value={fmtAmt(pendingTotal)} color="text-amber-600" />
          <table className="w-full text-sm border border-slate-100">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <th scope="col" className="text-left px-4 py-2.5 font-medium">Date</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium">Category</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium">Description</th>
                <th scope="col" className="text-right px-4 py-2.5 font-medium">Amount</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600">{e.expenseDate}</td>
                  <td className="px-4 py-2 text-slate-500 text-xs">{codeLabel(e.category)}</td>
                  <td className="px-4 py-2 text-slate-700">{e.description}</td>
                  <td className="px-4 py-2 text-right font-medium text-red-600">{fmtAmt(e.amount)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{codeLabel(e.approvalStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500">{rows.length} expense{rows.length !== 1 ? 's' : ''} in range.</p>
        </div>
      )}
    </div>
  )
}
