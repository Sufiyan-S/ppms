import { useState } from 'react'
import { serverMessage } from '../../../utils/apiError'
import { useQuery } from '@tanstack/react-query'
import { userApi } from '../../../api/userApi'
import { reportApi } from '../../../api/reportApi'
import type { OperatorDutyReport, OperatorDutyShiftLine } from '../../../api/reportApi'
import { SearchableSelect } from '../../../components/SearchableSelect'
import { Pagination } from '../../../components/Pagination'
import { pageSlice } from '../../../utils/pageSlice'
import { DateRangeInputs, ErrorBox, PrintHeader, SummaryCard } from '../shared'
import { fmtAmt, todayIso, yesterdayIso } from '../reportFormat'
import { ScrollRegion } from '../../../components/ScrollRegion'
import { codeLabel } from '../../../constants/labels'

// ── Operator Duty Tab ─────────────────────────────────────────────────────────

export function OperatorDutyTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to,   setTo]   = useState(todayIso)
  const [operatorId, setOperatorId] = useState<number | null>(null)
  const [query, setQuery] = useState<{ from: string; to: string; operatorId: number } | null>(null)
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data: staffList = [] } = useQuery({
    queryKey: ['staff', pumpId],
    queryFn: () => userApi.getStaff(pumpId),
  })

  const { data, isFetching, error } = useQuery<OperatorDutyReport>({
    queryKey: ['report-duty', pumpId, query?.operatorId, query?.from, query?.to],
    queryFn: () => reportApi.getOperatorDuty(pumpId, query!.operatorId, query!.from, query!.to),
    enabled: !!query,
  })

  const paged = data ? pageSlice(data.shifts, page, pageSize) : null

  const dutyTableHead = (
    <tr className="bg-slate-50 text-xs text-slate-500">
      <th scope="col" className="text-left px-4 py-2.5 font-medium">Date</th>
      <th scope="col" className="text-left px-4 py-2.5 font-medium">Window</th>
      <th scope="col" className="text-right px-4 py-2.5 font-medium">Amount Due</th>
      <th scope="col" className="text-right px-4 py-2.5 font-medium">Cash</th>
      <th scope="col" className="text-right px-4 py-2.5 font-medium">Credit</th>
      <th scope="col" className="text-right px-4 py-2.5 font-medium">Discrepancy</th>
      <th scope="col" className="text-left px-4 py-2.5 font-medium">Status</th>
    </tr>
  )
  const dutyRow = (s: OperatorDutyShiftLine) => (
    <tr key={s.shiftId} className="border-t border-slate-100">
      <td className="px-4 py-2.5 text-slate-600">{s.shiftDate}</td>
      <td className="px-4 py-2.5 text-slate-500">{s.shiftWindow}</td>
      <td className="px-4 py-2.5 text-right font-medium text-slate-700 tabular-nums">{fmtAmt(s.totalAmountDue)}</td>
      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{fmtAmt(s.cashCollected)}</td>
      <td className="px-4 py-2.5 text-right text-orange-600 tabular-nums">{fmtAmt(s.creditTotal)}</td>
      <td className={`px-4 py-2.5 text-right text-xs font-semibold tabular-nums ${s.discrepancyAmount > 0 ? (s.discrepancyType === 'SHORT' ? 'text-red-600' : 'text-amber-600') : 'text-slate-500'}`}>
        {s.discrepancyAmount > 0 ? `${s.discrepancyType} ${fmtAmt(s.discrepancyAmount)}` : '—'}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{codeLabel(s.status)}</td>
    </tr>
  )

  return (
    <div className="space-y-4">
      {/* Screen: controls */}
      <div className="ui-card ui-card-muted p-4 print:hidden">
        <div className="ui-filter-group">
        <div className="w-56">
          <span className="ui-label">Operator</span>
          <SearchableSelect label="Operator"
            value={operatorId ? String(operatorId) : ''}
            onChange={(v) => setOperatorId(v ? Number(v) : null)}
            options={staffList.filter(s => s.role === 'OPERATOR').map(s => ({ value: String(s.id), label: s.fullName }))}
            placeholder="Select operator…"
          />
        </div>
        <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <button
          onClick={() => { if (operatorId) setQuery({ from, to, operatorId }); setPage(0) }}
          disabled={!operatorId || isFetching}
          className="ui-btn ui-btn-primary"
        >
          {isFetching ? 'Loading…' : 'Generate'}
        </button>
        <button
          onClick={() => window.print()}
          disabled={!data || data.shifts.length === 0}
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
            <SummaryCard label="Total Shifts"      value={String(data.totalShifts)}      color="text-slate-800" />
            <SummaryCard label="Total Amount Due"  value={fmtAmt(data.totalAmountDue)}   color="text-slate-800" />
            <SummaryCard label="Total Discrepancy" value={fmtAmt(data.totalDiscrepancy)} color={data.totalDiscrepancy > 0 ? 'text-red-700' : 'text-green-700'} />
          </div>
          <div className="ui-table-wrap">
            <table className="w-full text-sm">
              <thead>{dutyTableHead}</thead>
              <tbody>{paged.content.map(dutyRow)}</tbody>
            </table>
          </div>
          <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}

      {/* Print: full dataset */}
      {data && data.shifts.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title={`Operator Duty Report — ${data.operatorName}`} from={query?.from} to={query?.to} />
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Shifts"      value={String(data.totalShifts)}      color="text-slate-800" />
            <SummaryCard label="Total Amount Due"  value={fmtAmt(data.totalAmountDue)}   color="text-slate-800" />
            <SummaryCard label="Total Discrepancy" value={fmtAmt(data.totalDiscrepancy)} color={data.totalDiscrepancy > 0 ? 'text-red-700' : 'text-green-700'} />
          </div>
          <ScrollRegion label="Operator duty" className="ui-card p-0 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>{dutyTableHead}</thead>
              <tbody>{data.shifts.map(dutyRow)}</tbody>
            </table>
          </ScrollRegion>
        </div>
      )}
    </div>
  )
}
