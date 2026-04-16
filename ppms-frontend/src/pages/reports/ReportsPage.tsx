import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Reveal } from '../../components/Reveal'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { userApi } from '../../api/userApi'
import { reportApi } from '../../api/reportApi'
import { pumpApi } from '../../api/pumpApi'
import type { ProfitLossReport, OperatorDutyReport, OperatorDutyShiftLine, OperatorDiscrepancyReport, InventoryLotsReport, DipPlEntry, ShiftReportLine, ExpenseReportLine, InterestAccrualReport } from '../../api/reportApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import type { PagedResponse } from '../../types/paged'
import { formatIstDate, formatIstDateTime, localDateInputValue } from '../../utils/date'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtQty(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' L'
}

function todayIso()     { return localDateInputValue() }
function yesterdayIso() { return localDateInputValue(-1) }

function fmtDateTime(iso: string) {
  return formatIstDateTime(iso)
}

function fmtShortDate(iso: string) {
  return formatIstDate(iso, { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtShortDayMonth(iso: string) {
  return formatIstDate(iso, { day: '2-digit', month: 'short' })
}

/** Builds a PagedResponse shape from a client-side array slice — used for client-side pagination of report data. */
function pageSlice<T>(all: T[], page: number, pageSize: number): PagedResponse<T> {
  const totalElements = all.length
  const totalPages    = Math.max(1, Math.ceil(totalElements / pageSize))
  const safePage      = Math.min(page, totalPages - 1)
  const content       = all.slice(safePage * pageSize, (safePage + 1) * pageSize)
  return {
    content,
    page: safePage,
    pageSize,
    totalElements,
    totalPages,
    hasNext:     safePage < totalPages - 1,
    hasPrevious: safePage > 0,
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'pl' | 'duty' | 'discrepancy' | 'inventory' | 'dip' | 'shifts' | 'expenses' | 'interest'

export default function ReportsPage() {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const [tab, setTab] = useState<Tab>('pl')
  const { selectedPumpId } = usePumpStore()

  const pumpId = selectedPumpId

  const { data: pumps = [] } = useQuery({
    queryKey: ['my-pumps'],
    queryFn: () => pumpApi.getMyPumps(),
  })

  const pumpName = pumpId ? (pumps.find(p => p.id === pumpId)?.name ?? '') : ''
  const userName = user?.fullName ?? ''

  const TABS: { id: Tab; label: string }[] = [
    { id: 'pl',          label: 'Profit & Loss' },
    { id: 'duty',        label: 'Operator Duty' },
    { id: 'discrepancy', label: 'Short / Over' },
    { id: 'inventory',   label: 'Inventory Lots' },
    { id: 'dip',      label: 'Dip P/L' },
    { id: 'shifts',   label: 'Shifts' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'interest', label: 'Interest Accrual' },
  ]

  if (!pumpId && !isOwnerOrAdmin) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning text-sm">
          You are not assigned to any pump. Ask the Owner or Admin to assign you.
        </div>
      </div>
    )
  }

  return (
    <div className="ui-page ui-page--narrow space-y-5">
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Analysis</p>
          <h2 className="ui-title-sm">Reports</h2>
          <p className="ui-subtitle print:hidden">Operational and financial reports for your pump.</p>
          <p className="hidden print:block text-xs text-slate-500 mt-0.5">
            {pumpName && <><span className="font-medium">{pumpName}</span> · </>}
            {userName && <>Printed by: <span className="font-medium">{userName}</span> · </>}
            <span className="text-slate-400">{fmtDateTime(new Date().toISOString())}</span>
          </p>
        </div>
        <div className="ui-section-meta print:hidden">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Pump</span>
            <span className="ui-section-meta-value">{pumpName || 'Not selected'}</span>
          </div>
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Active tab</span>
            <span className="ui-section-meta-value">{TABS.find((reportTab) => reportTab.id === tab)?.label ?? 'Reports'}</span>
          </div>
        </div>
      </div>
      </Reveal>

      {!pumpId ? (
        <div className="ui-empty">
          No pump selected. Use the pump selector in the top navigation bar.
        </div>
      ) : (
        <div className="ui-card p-0 overflow-hidden">
          {/* Tabs — hidden when printing */}
      <div className="ui-tabbar print:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`ui-tabbar__button ${
                  tab === t.id
                    ? 'ui-tabbar__button--active'
                    : ''
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div key={tab} className="p-5 ui-tab-content">
            {tab === 'pl'          && <ProfitLossTab          pumpId={pumpId} />}
            {tab === 'duty'        && <OperatorDutyTab        pumpId={pumpId} />}
            {tab === 'discrepancy' && <DiscrepancyTab         pumpId={pumpId} />}
            {tab === 'inventory'   && <InventoryLotsTab       pumpId={pumpId} />}
            {tab === 'dip'      && <DipPlTab          pumpId={pumpId} />}
            {tab === 'shifts'   && <ShiftsTab         pumpId={pumpId} />}
            {tab === 'expenses' && <ExpensesTab        pumpId={pumpId} />}
            {tab === 'interest' && <InterestAccrualTab pumpId={pumpId} />}
          </div>
        </div>
      )}

    </div>
  )
}

// ── P&L Tab ───────────────────────────────────────────────────────────────────

function ProfitLossTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to,   setTo]   = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null)
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

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
          className="ui-btn bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={(error as any)?.response?.data?.message ?? 'Failed to load report'} />}

      {/* Screen: paginated data */}
      {data && paged && (
        <div className="space-y-4 print:hidden">
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Revenue"   value={fmtAmt(data.totalRevenue)} color="text-slate-800" />
            <SummaryCard label="Cost of Goods"   value={fmtAmt(data.totalCogs)}    color="text-red-600" />
            <SummaryCard label="Gross Profit"    value={fmtAmt(data.grossProfit)}  color={data.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'} />
          </div>
          <div className="ui-table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Fuel Type</th>
                  <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                  <th className="text-right px-4 py-2.5 font-medium">COGS</th>
                  <th className="text-right px-4 py-2.5 font-medium">Gross Profit</th>
                </tr>
              </thead>
              <tbody>
                {paged.content.map((row) => (
                  <tr key={row.fuelType} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{row.fuelType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmtAmt(row.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{fmtAmt(row.cogs)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${row.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtAmt(row.grossProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
          <p className="text-xs text-slate-400">{data.totalShifts} closed shift{data.totalShifts !== 1 ? 's' : ''} in range.</p>
        </div>
      )}

      {/* Print: full dataset */}
      {data && data.byFuelType.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Profit & Loss Report" from={query?.from} to={query?.to} />
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Revenue"   value={fmtAmt(data.totalRevenue)} color="text-slate-800" />
            <SummaryCard label="Cost of Goods"   value={fmtAmt(data.totalCogs)}    color="text-red-600" />
            <SummaryCard label="Gross Profit"    value={fmtAmt(data.grossProfit)}  color={data.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'} />
          </div>
          <div className="ui-card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Fuel Type</th>
                  <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                  <th className="text-right px-4 py-2.5 font-medium">COGS</th>
                  <th className="text-right px-4 py-2.5 font-medium">Gross Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.byFuelType.map((row) => (
                  <tr key={row.fuelType} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{row.fuelType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{fmtAmt(row.revenue)}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{fmtAmt(row.cogs)}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${row.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtAmt(row.grossProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">{data.totalShifts} closed shift{data.totalShifts !== 1 ? 's' : ''} in range.</p>
        </div>
      )}
    </div>
  )
}

// ── Operator Duty Tab ─────────────────────────────────────────────────────────

function OperatorDutyTab({ pumpId }: { pumpId: number }) {
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
      <th className="text-left px-4 py-2.5 font-medium">Date</th>
      <th className="text-left px-4 py-2.5 font-medium">Window</th>
      <th className="text-right px-4 py-2.5 font-medium">Amount Due</th>
      <th className="text-right px-4 py-2.5 font-medium">Cash</th>
      <th className="text-right px-4 py-2.5 font-medium">Credit</th>
      <th className="text-right px-4 py-2.5 font-medium">Discrepancy</th>
      <th className="text-left px-4 py-2.5 font-medium">Status</th>
    </tr>
  )
  const dutyRow = (s: OperatorDutyShiftLine) => (
    <tr key={s.shiftId} className="border-t border-slate-100">
      <td className="px-4 py-2.5 text-slate-600">{s.shiftDate}</td>
      <td className="px-4 py-2.5 text-slate-500">{s.shiftWindow}</td>
      <td className="px-4 py-2.5 text-right font-medium text-slate-700">{fmtAmt(s.totalAmountDue)}</td>
      <td className="px-4 py-2.5 text-right text-slate-600">{fmtAmt(s.cashCollected)}</td>
      <td className="px-4 py-2.5 text-right text-orange-600">{fmtAmt(s.creditTotal)}</td>
      <td className={`px-4 py-2.5 text-right text-xs font-semibold ${s.discrepancyAmount > 0 ? (s.discrepancyType === 'SHORT' ? 'text-red-600' : 'text-amber-600') : 'text-slate-300'}`}>
        {s.discrepancyAmount > 0 ? `${s.discrepancyType} ${fmtAmt(s.discrepancyAmount)}` : '—'}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500">{s.status.replace(/_/g, ' ')}</td>
    </tr>
  )

  return (
    <div className="space-y-4">
      {/* Screen: controls */}
      <div className="ui-card ui-card-muted p-4 print:hidden">
        <div className="ui-filter-group">
        <div className="w-56">
          <label className="ui-label">Operator</label>
          <SearchableSelect
            value={operatorId ? String(operatorId) : ''}
            onChange={(v) => setOperatorId(v ? Number(v) : null)}
            options={staffList.filter(s => s.role === 'OPERATOR').map(s => ({ value: String(s.id), label: s.fullName }))}
            placeholder="Select operator…"
          />
        </div>
        <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <button
          onClick={() => { operatorId && setQuery({ from, to, operatorId }); setPage(0) }}
          disabled={!operatorId || isFetching}
          className="ui-btn ui-btn-primary"
        >
          {isFetching ? 'Loading…' : 'Generate'}
        </button>
        <button
          onClick={() => window.print()}
          disabled={!data || data.shifts.length === 0}
          className="ui-btn bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={(error as any)?.response?.data?.message ?? 'Failed to load report'} />}

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
          <div className="ui-card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>{dutyTableHead}</thead>
              <tbody>{data.shifts.map(dutyRow)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Short / Over Discrepancy Tab ──────────────────────────────────────────────

function DiscrepancyTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to,   setTo]   = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null)
  const [expandedOp, setExpandedOp] = useState<number | null>(null)

  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<OperatorDiscrepancyReport>({
    queryKey: ['report-discrepancy', pumpId, query?.from, query?.to],
    queryFn: () => reportApi.getOperatorDiscrepancy(pumpId, query!.from, query!.to),
    enabled: !!query,
  })

  const paged = data ? pageSlice(data.operators, page, pageSize) : null

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
          disabled={!data || data.operators.length === 0}
          className="ui-btn bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={(error as any)?.response?.data?.message ?? 'Failed to load report'} />}

      {data && paged && (
        <div className="space-y-3 print:hidden">
          <p className="text-xs text-slate-400">
            {data.totalDiscrepancyShifts} discrepancy shift{data.totalDiscrepancyShifts !== 1 ? 's' : ''} in range.
          </p>
          {paged.content.length === 0 ? (
            <div className="ui-empty py-6">No discrepancies in this date range.</div>
          ) : (
            paged.content.map((op) => (
              <div key={op.operatorId} className="ui-card p-0 overflow-hidden">
                <button
                  className="ui-accordion-trigger"
                  onClick={() => setExpandedOp(expandedOp === op.operatorId ? null : op.operatorId)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">{op.operatorName}</span>
                    <span className="text-xs text-slate-400">{op.discrepancyShiftCount} shifts</span>
                    {op.unresolvedCount > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        {op.unresolvedCount} unresolved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    {op.totalShortAmount > 0 && (
                      <span className="text-red-600 font-semibold">Short {fmtAmt(op.totalShortAmount)}</span>
                    )}
                    {op.totalOverAmount > 0 && (
                      <span className="text-amber-600 font-semibold">Over {fmtAmt(op.totalOverAmount)}</span>
                    )}
                    <span className="text-slate-400">{expandedOp === op.operatorId ? '▲' : '▼'}</span>
                  </div>
                </button>
                {expandedOp === op.operatorId && (
                  <table className="w-full text-xs border-t border-slate-100">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="text-left px-4 py-2 font-medium">Date</th>
                        <th className="text-left px-4 py-2 font-medium">Type</th>
                        <th className="text-right px-4 py-2 font-medium">Amount</th>
                        <th className="text-left px-4 py-2 font-medium">Status</th>
                        <th className="text-left px-4 py-2 font-medium">Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {op.shifts.map((s) => (
                        <tr key={s.shiftId} className="border-t border-slate-100">
                          <td className="px-4 py-2 text-slate-600">{s.shiftDate}</td>
                          <td className={`px-4 py-2 font-semibold ${s.discrepancyType === 'SHORT' ? 'text-red-600' : 'text-amber-600'}`}>
                            {s.discrepancyType}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-700">{fmtAmt(s.discrepancyAmount)}</td>
                          <td className="px-4 py-2 text-slate-500">{s.status.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2 text-slate-500">{s.resolution?.replace(/_/g, ' ') ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}
          <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}

      {/* Print: full dataset */}
      {data && data.operators.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Short / Over Discrepancy Report" from={query?.from} to={query?.to} />
          <p className="text-xs text-slate-500 mb-2">
            {data.totalDiscrepancyShifts} discrepancy shift{data.totalDiscrepancyShifts !== 1 ? 's' : ''} in range.
          </p>
          {data.operators.map((op) => (
            <div key={op.operatorId} className="mb-4">
              <div className="flex items-center gap-3 mb-1 pb-1 border-b border-slate-200">
                <span className="text-sm font-semibold text-slate-700">{op.operatorName}</span>
                <span className="text-xs text-slate-400">{op.discrepancyShiftCount} shifts</span>
                {op.totalShortAmount > 0 && <span className="text-xs text-red-600 font-semibold">Short {fmtAmt(op.totalShortAmount)}</span>}
                {op.totalOverAmount > 0  && <span className="text-xs text-amber-600 font-semibold">Over {fmtAmt(op.totalOverAmount)}</span>}
              </div>
              <table className="w-full text-xs border border-slate-100">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-left px-3 py-2 font-medium">Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {op.shifts.map((s) => (
                    <tr key={s.shiftId} className="border-t border-slate-100">
                      <td className="px-3 py-1.5 text-slate-600">{s.shiftDate}</td>
                      <td className={`px-3 py-1.5 font-semibold ${s.discrepancyType === 'SHORT' ? 'text-red-600' : 'text-amber-600'}`}>{s.discrepancyType}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-slate-700">{fmtAmt(s.discrepancyAmount)}</td>
                      <td className="px-3 py-1.5 text-slate-500">{s.status.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-1.5 text-slate-500">{s.resolution?.replace(/_/g, ' ') ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inventory Lots Tab ────────────────────────────────────────────────────────

function InventoryLotsTab({ pumpId }: { pumpId: number }) {
  const [tankId, setTankId] = useState<number | null>(null)
  const [query, setQuery] = useState<number | null>(null)
  const [expandedLot, setExpandedLot] = useState<number | null>(null)

  const { data: tanks = [] } = useQuery({
    queryKey: ['tanks', pumpId],
    queryFn: () => pumpApi.getTanks(pumpId),
  })

  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<InventoryLotsReport>({
    queryKey: ['report-inventory', pumpId, query],
    queryFn: () => reportApi.getInventoryLots(pumpId, query!),
    enabled: query !== null,
  })

  const paged = data ? pageSlice(data.lots, page, pageSize) : null

  return (
    <div className="space-y-4">
      <div className="ui-card ui-card-muted p-4 print:hidden">
        <div className="ui-filter-group">
        <div className="w-56">
          <label className="ui-label">Tank</label>
          <SearchableSelect
            value={tankId ? String(tankId) : ''}
            onChange={(v) => setTankId(v ? Number(v) : null)}
            options={tanks.map(t => ({ value: String(t.id), label: `${t.tankIdentifier} (${t.fuelType})` }))}
            placeholder="Select tank…"
          />
        </div>
        <button
          onClick={() => { tankId && setQuery(tankId); setPage(0) }}
          disabled={!tankId || isFetching}
          className="ui-btn ui-btn-primary"
        >
          {isFetching ? 'Loading…' : 'Load Lots'}
        </button>
        <button
          onClick={() => window.print()}
          disabled={!data || data.lots.length === 0}
          className="ui-btn bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={(error as any)?.response?.data?.message ?? 'Failed to load report'} />}

      {data && paged && (
        <div className="space-y-3 print:hidden">
          <p className="text-xs text-slate-400">{data.totalLots} lot{data.totalLots !== 1 ? 's' : ''} in this tank.</p>
          {paged.content.map((lot) => (
            <div key={lot.lotId} className="ui-card p-0 overflow-hidden">
              <button
                className="ui-accordion-trigger"
                onClick={() => setExpandedLot(expandedLot === lot.lotId ? null : lot.lotId)}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    lot.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>{lot.status}</span>
                  {lot.isDipAdjustment && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">DIP Adj.</span>
                  )}
                  <span className="text-sm font-medium text-slate-700">
                    {fmtShortDate(lot.deliveryDate)}
                  </span>
                  <span className="text-xs text-slate-400">{lot.fuelType.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>₹{lot.costPricePerUnit}/L</span>
                  <span>{fmtQty(lot.remainingQuantity)} remaining</span>
                  <span>{fmtAmt(lot.totalCogsConsumed)} COGS</span>
                  <span className="text-slate-400">{expandedLot === lot.lotId ? '▲' : '▼'}</span>
                </div>
              </button>
              {expandedLot === lot.lotId && lot.consumptions.length > 0 && (
                <table className="w-full text-xs border-t border-slate-100">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-left px-4 py-2 font-medium">Source</th>
                      <th className="text-left px-4 py-2 font-medium">Shift</th>
                      <th className="text-right px-4 py-2 font-medium">Qty (L)</th>
                      <th className="text-right px-4 py-2 font-medium">Cost/L</th>
                      <th className="text-right px-4 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lot.consumptions.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="px-4 py-2 text-slate-500">
                          {fmtShortDayMonth(c.consumedAt)}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{c.sourceType.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-2 text-slate-500">{c.shiftName ?? '—'}</td>
                        <td className="px-4 py-2 text-right text-slate-700">
                          {c.quantityConsumed.toLocaleString('en-IN', { minimumFractionDigits: 3 })}
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

      {/* Print: full dataset */}
      {data && data.lots.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Inventory Lots Report" />
          <p className="text-xs text-slate-500 mb-2">{data.totalLots} lot{data.totalLots !== 1 ? 's' : ''} in this tank.</p>
          {data.lots.map((lot) => (
            <div key={lot.lotId} className="mb-4">
              <div className="flex items-center gap-3 mb-1 pb-1 border-b border-slate-200 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lot.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{lot.status}</span>
                {lot.isDipAdjustment && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">DIP Adj.</span>}
                <span className="text-sm font-medium text-slate-700">
                  {fmtShortDate(lot.deliveryDate)}
                </span>
                <span className="text-xs text-slate-500">{lot.fuelType.replace(/_/g, ' ')}</span>
                <span className="text-xs text-slate-500">₹{lot.costPricePerUnit}/L</span>
                <span className="text-xs text-slate-500">{fmtQty(lot.remainingQuantity)} remaining</span>
                <span className="text-xs text-slate-500">{fmtAmt(lot.totalCogsConsumed)} COGS</span>
              </div>
              {lot.consumptions.length > 0 ? (
                <table className="w-full text-xs border border-slate-100">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Source</th>
                      <th className="text-left px-3 py-2 font-medium">Shift</th>
                      <th className="text-right px-3 py-2 font-medium">Qty (L)</th>
                      <th className="text-right px-3 py-2 font-medium">Cost/L</th>
                      <th className="text-right px-3 py-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lot.consumptions.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-500">
                          {fmtShortDayMonth(c.consumedAt)}
                        </td>
                        <td className="px-3 py-1.5 text-slate-500">{c.sourceType.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-1.5 text-slate-500">{c.shiftName ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right text-slate-700">{c.quantityConsumed.toLocaleString('en-IN', { minimumFractionDigits: 3 })}</td>
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

// ── Dip P/L Tab ───────────────────────────────────────────────────────────────

function DipPlTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to,   setTo]   = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null)
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

  const FUEL_COLORS: Record<string, string> = {
    PETROL:       'bg-emerald-100 text-emerald-700',
    DIESEL:       'bg-blue-100 text-blue-700',
    SPEED_PETROL: 'bg-violet-100 text-violet-700',
    SPEED_DIESEL: 'bg-indigo-100 text-indigo-700',
    CNG:          'bg-amber-100 text-amber-700',
  }

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
          className="ui-btn bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={(error as any)?.message ?? 'Failed to load dip P/L entries'} />}

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
              <div className="ui-table-wrap overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Date &amp; Time</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Type</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Fuel</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Litres</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">P/L</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.content.map((e, idx) => {
                      const isGain = e.monetaryAmount > 0
                      const isLoss = e.monetaryAmount < 0
                      const plColor = isGain ? 'text-emerald-600' : isLoss ? 'text-red-600' : 'text-slate-400'
                      const litresColor = e.type === 'DIP_CHECK'
                        ? (e.litres > 0 ? 'text-emerald-600' : e.litres < 0 ? 'text-red-600' : 'text-slate-400')
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
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${FUEL_COLORS[e.fuelType] ?? 'bg-slate-100 text-slate-600'}`}>
                              {e.fuelType.replace('_', ' ')}
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
                        <td className={`px-3 py-2.5 text-right font-medium ${isNetGain ? 'text-emerald-600' : isNetLoss ? 'text-red-600' : 'text-slate-400'}`}>
                          {isNetGain ? '+' : ''}{fmtAmt(netPl)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
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
          <table className="w-full text-sm border border-slate-200">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Date &amp; Time</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Type</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Fuel</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">Litres</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 text-right">P/L</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => {
                const isGain = e.monetaryAmount > 0
                const isLoss = e.monetaryAmount < 0
                const plColor = isGain ? 'text-emerald-600' : isLoss ? 'text-red-600' : 'text-slate-400'
                const litresColor = e.type === 'DIP_CHECK'
                  ? (e.litres > 0 ? 'text-emerald-600' : e.litres < 0 ? 'text-red-600' : 'text-slate-400')
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
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${FUEL_COLORS[e.fuelType] ?? 'bg-slate-100 text-slate-600'}`}>
                        {e.fuelType.replace('_', ' ')}
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
                  <td className={`px-3 py-2.5 text-right font-medium ${isNetGain ? 'text-emerald-600' : isNetLoss ? 'text-red-600' : 'text-slate-400'}`}>
                    {isNetGain ? '+' : ''}{fmtAmt(netPl)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

// ── Shifts Tab ────────────────────────────────────────────────────────────────

function ShiftsTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to, setTo]     = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null)
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<ShiftReportLine[]>({
    queryKey: ['report-shifts', pumpId, query?.from, query?.to],
    queryFn:  () => reportApi.getShiftsReport(pumpId, query!.from, query!.to),
    enabled:  !!query,
  })

  const rows  = data ?? []
  const paged = data ? pageSlice(rows, page, pageSize) : null

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
          className="ui-btn bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={(error as any)?.response?.data?.message ?? 'Failed to load report'} />}

      {/* Screen: paginated data */}
      {data && paged && (
        rows.length === 0 ? (
          <p className="ui-empty py-4 print:hidden">No closed shifts in this date range.</p>
        ) : (
          <div className="space-y-2 print:hidden">
            <div className="ui-table-wrap overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500">
                    <th className="text-left px-4 py-2.5 font-medium">Date</th>
                    <th className="text-left px-4 py-2.5 font-medium">Window</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium">Amount Due</th>
                    <th className="text-right px-4 py-2.5 font-medium">Cash</th>
                    <th className="text-right px-4 py-2.5 font-medium">UPI</th>
                    <th className="text-right px-4 py-2.5 font-medium">Card</th>
                    <th className="text-right px-4 py-2.5 font-medium">Credit</th>
                    <th className="text-right px-4 py-2.5 font-medium">Discrepancy</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.content.map(s => (
                    <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-slate-600">{s.shiftDate}</td>
                      <td className="px-4 py-2.5 text-slate-500">{s.shiftName ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{s.status?.replace(/_/g, ' ') ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-700">{fmtAmt(s.totalAmountDue)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{fmtAmt(s.cashCollected)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{fmtAmt(s.upiCollected)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{fmtAmt(s.cardCollected)}</td>
                      <td className="px-4 py-2.5 text-right text-orange-600">{fmtAmt(s.creditTotal)}</td>
                      <td className={`px-4 py-2.5 text-right text-xs font-semibold ${
                        s.discrepancyAmount && s.discrepancyAmount > 0
                          ? (s.discrepancyType === 'SHORT' ? 'text-red-600' : 'text-amber-600')
                          : 'text-slate-300'
                      }`}>
                        {s.discrepancyAmount && s.discrepancyAmount > 0
                          ? `${s.discrepancyType} ${fmtAmt(s.discrepancyAmount)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
            <p className="text-xs text-slate-400">{rows.length} shift{rows.length !== 1 ? 's' : ''} in range.</p>
          </div>
        )
      )}

      {/* Print: full dataset */}
      {data && rows.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Shifts Report" from={query?.from} to={query?.to} />
          <table className="w-full text-sm border border-slate-100">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Window</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount Due</th>
                <th className="text-right px-4 py-2.5 font-medium">Cash</th>
                <th className="text-right px-4 py-2.5 font-medium">UPI</th>
                <th className="text-right px-4 py-2.5 font-medium">Card</th>
                <th className="text-right px-4 py-2.5 font-medium">Credit</th>
                <th className="text-right px-4 py-2.5 font-medium">Discrepancy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600">{s.shiftDate}</td>
                  <td className="px-4 py-2 text-slate-500">{s.shiftName ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-500 text-xs">{s.status?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-700">{fmtAmt(s.totalAmountDue)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{fmtAmt(s.cashCollected)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{fmtAmt(s.upiCollected)}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{fmtAmt(s.cardCollected)}</td>
                  <td className="px-4 py-2 text-right text-orange-600">{fmtAmt(s.creditTotal)}</td>
                  <td className={`px-4 py-2 text-right text-xs font-semibold ${
                    s.discrepancyAmount && s.discrepancyAmount > 0
                      ? (s.discrepancyType === 'SHORT' ? 'text-red-600' : 'text-amber-600')
                      : 'text-slate-300'
                  }`}>
                    {s.discrepancyAmount && s.discrepancyAmount > 0
                      ? `${s.discrepancyType} ${fmtAmt(s.discrepancyAmount)}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400">{rows.length} shift{rows.length !== 1 ? 's' : ''} in range.</p>
        </div>
      )}
    </div>
  )
}

// ── Expenses Tab ──────────────────────────────────────────────────────────────

function ExpensesTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to, setTo]     = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null)
  const [page, setPage]   = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { data, isFetching, error } = useQuery<ExpenseReportLine[]>({
    queryKey: ['report-expenses', pumpId, query?.from, query?.to],
    queryFn:  () => reportApi.getExpensesReport(pumpId, query!.from, query!.to),
    enabled:  !!query,
  })

  const rows  = data ?? []
  const paged = data ? pageSlice(rows, page, pageSize) : null
  const total = rows.reduce((sum, e) => sum + e.amount, 0)

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
          className="ui-btn bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
        >
          Print PDF
        </button>
        </div>
      </div>

      {error && <ErrorBox message={(error as any)?.response?.data?.message ?? 'Failed to load report'} />}

      {/* Screen: paginated data */}
      {data && paged && (
        rows.length === 0 ? (
          <p className="ui-empty py-4 print:hidden">No expenses in this date range.</p>
        ) : (
          <div className="space-y-3 print:hidden">
            <SummaryCard label="Total Expenses" value={fmtAmt(total)} color="text-red-600" />
            <div className="ui-table-wrap">
              <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500">
                  <th className="text-left px-4 py-2.5 font-medium">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium">Category</th>
                  <th className="text-left px-4 py-2.5 font-medium">Description</th>
                  <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {paged.content.map(e => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-600">{e.expenseDate}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{e.category?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700">{e.description}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-red-600">{fmtAmt(e.amount)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{e.approvalStatus?.replace(/_/g, ' ') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <Pagination data={paged} onPageChange={setPage} onPageSizeChange={s => { setPageSize(s); setPage(0) }} pageSizeOptions={[10, 20, 50]} />
            <p className="text-xs text-slate-400">{rows.length} expense{rows.length !== 1 ? 's' : ''} in range.</p>
          </div>
        )
      )}

      {/* Print: full dataset */}
      {data && rows.length > 0 && (
        <div className="hidden print:block space-y-4">
          <PrintHeader title="Expenses Report" from={query?.from} to={query?.to} />
          <SummaryCard label="Total Expenses" value={fmtAmt(total)} color="text-red-600" />
          <table className="w-full text-sm border border-slate-100">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Category</th>
                <th className="text-left px-4 py-2.5 font-medium">Description</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-600">{e.expenseDate}</td>
                  <td className="px-4 py-2 text-slate-500 text-xs">{e.category?.replace(/_/g, ' ') ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-700">{e.description}</td>
                  <td className="px-4 py-2 text-right font-medium text-red-600">{fmtAmt(e.amount)}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{e.approvalStatus?.replace(/_/g, ' ') ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-400">{rows.length} expense{rows.length !== 1 ? 's' : ''} in range.</p>
        </div>
      )}
    </div>
  )
}

// ── Shared small components ───────────────────────────────────────────────────

function PrintHeader({ title, from, to }: { title: string; from?: string; to?: string }) {
  return (
    <div className="mb-4 border-b border-slate-200 pb-3">
      <h2 className="ui-title-sm">{title}</h2>
      {(from || to) && <p className="ui-help">Period: {from ?? '—'} to {to ?? '—'}</p>}
    </div>
  )
}

function DateRangeInputs({
  from, to, onFromChange, onToChange,
}: { from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void }) {
  return (
    <div className="ui-filter-group">
      <div>
        <label className="ui-label">From</label>
        <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)}
          className="min-w-40 shadow-sm" />
      </div>
      <div>
        <label className="ui-label">To</label>
        <input type="date" value={to} onChange={(e) => onToChange(e.target.value)}
          className="min-w-40 shadow-sm" />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="ui-card ui-card-muted p-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="ui-alert ui-alert-danger text-sm">{message}</div>
  )
}

// ── Interest Accrual Tab ───────────────────────────────────────────────────────

function InterestAccrualTab({ pumpId }: { pumpId: number }) {
  const [from, setFrom] = useState(yesterdayIso)
  const [to,   setTo]   = useState(todayIso)
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null)

  const { data, isFetching, error } = useQuery<InterestAccrualReport>({
    queryKey: ['report-interest', pumpId, query?.from, query?.to],
    queryFn:  () => reportApi.getInterestAccrual(pumpId, query!.from, query!.to),
    enabled:  !!query,
  })

  return (
    <div className="space-y-4">
      <div className="ui-card ui-card-muted p-4 print:hidden">
        <div className="ui-filter-group">
          <DateRangeInputs from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          <button
            onClick={() => setQuery({ from, to })}
            disabled={isFetching}
            className="ui-btn ui-btn-primary"
          >
            {isFetching ? 'Loading…' : 'Generate'}
          </button>
          <button
            onClick={() => window.print()}
            disabled={!data || data.clients.length === 0}
            className="ui-btn bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Print PDF
          </button>
        </div>
      </div>

      {error && <ErrorBox message={(error as any)?.response?.data?.message ?? 'Failed to load report'} />}

      {data && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <SummaryCard label="Total Charges"  value={String(data.totalCharges)}  color="text-slate-800" />
            <SummaryCard label="Total Interest" value={fmtAmt(data.totalInterest)} color="text-red-600" />
            <SummaryCard label="Clients"        value={String(data.clients.length)} color="text-slate-800" />
          </div>

          {data.clients.length === 0 ? (
            <p className="ui-empty py-8">No interest charges found for this period.</p>
          ) : (
            data.clients.map(client => (
              <div key={client.clientId} className="ui-card p-0 overflow-hidden">
                {/* Client header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{client.clientName}</p>
                    <p className="text-xs text-slate-400">{client.chargeCount} charge{client.chargeCount !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-sm font-bold text-red-600">{fmtAmt(client.totalInterest)}</span>
                </div>

                {/* Charge lines */}
                <div className="divide-y divide-slate-100 text-xs">
                  {client.charges.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="text-slate-500 space-y-0.5">
                        <p>{fmtShortDate(c.periodFrom)} – {fmtShortDate(c.periodTo)} ({c.daysApplied} days)</p>
                        <p>Balance {fmtAmt(c.outstandingBalance)} @ {c.rateApplied}%/month · {c.source}</p>
                      </div>
                      <span className="font-medium text-slate-700 flex-shrink-0">{fmtAmt(c.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
