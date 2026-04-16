import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '../../api/auditApi'
import { usePumpStore } from '../../store/usePumpStore'
import type { AuditAction } from '../../api/auditApi'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { formatIstDateTime, localDateInputValue } from '../../utils/date'

const ACTION_STYLES: Partial<Record<AuditAction, string>> = {
  // User management
  USER_CREATED:               'bg-blue-100 text-blue-700',
  USER_DEACTIVATED:           'bg-red-100 text-red-700',
  USER_STATUS_CHANGED:        'bg-amber-100 text-amber-700',
  // Authentication
  LOGIN:                      'bg-slate-100 text-slate-600',
  LOGIN_FAILED:               'bg-red-100 text-red-700',
  TOKEN_REVOKED:              'bg-slate-100 text-slate-600',
  // Fuel pricing
  FUEL_PRICE_UPDATED:         'bg-purple-100 text-purple-700',
  // Shift lifecycle
  SHIFT_OPENED:               'bg-sky-100 text-sky-700',
  SHIFT_CLOSED:               'bg-emerald-100 text-emerald-700',
  DISCREPANCY_RESOLVED:       'bg-amber-100 text-amber-700',
  // Credit
  CREDIT_ENTRY_VOIDED:        'bg-red-100 text-red-700',
  CREDIT_LIMIT_CHANGED:       'bg-orange-100 text-orange-700',
  CREDIT_PAYMENT_RECEIVED:    'bg-teal-100 text-teal-700',
  INTEREST_APPLIED:           'bg-orange-100 text-orange-700',
  CREDIT_CLIENT_CREATED:      'bg-blue-100 text-blue-700',
  CREDIT_CLIENT_DELETED:      'bg-red-100 text-red-700',
  CREDIT_ENTRY_REASSIGNED:    'bg-amber-100 text-amber-700',
  // Inventory
  DELIVERY_RECORDED:          'bg-indigo-100 text-indigo-700',
  DIP_CHECK_RECORDED:         'bg-indigo-100 text-indigo-700',
  // Documents / Expenses
  DOCUMENT_ADDED:             'bg-slate-100 text-slate-700',
  EXPENSE_RECORDED:           'bg-rose-100 text-rose-700',
  // Payroll
  PAYROLL_APPROVED:           'bg-emerald-100 text-emerald-700',
  // Pump management
  PUMP_CREATED:               'bg-blue-100 text-blue-700',
  PUMP_DELETED:               'bg-red-100 text-red-700',
  NOZZLE_ADDED:               'bg-blue-100 text-blue-700',
  TANK_ADDED:                 'bg-blue-100 text-blue-700',
  // Ancillary
  ANCILLARY_SALE_RECORDED:    'bg-teal-100 text-teal-700',
  ANCILLARY_DELIVERY_RECORDED:'bg-indigo-100 text-indigo-700',
  // Operations
  HANDOVER_COMPLETED:         'bg-emerald-100 text-emerald-700',
  PUMP_CLOSURE_ADDED:         'bg-slate-100 text-slate-700',
  BANK_STATEMENT_IMPORTED:    'bg-indigo-100 text-indigo-700',
  SUPPLIER_PAYMENT_RECORDED:  'bg-teal-100 text-teal-700',
  PUMP_CONFIG_UPDATED:        'bg-purple-100 text-purple-700',
}

const PAGE_SIZE_OPTIONS = [10, 25, 50]

function fmtDateTime(d: string) {
  return formatIstDateTime(d, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export default function AuditLogPage() {
  const [from, setFrom]       = useState(() => localDateInputValue(-1))
  const [to, setTo]           = useState(() => localDateInputValue())
  const [page, setPage]       = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const { selectedPumpId: pumpId } = usePumpStore()

  const { data, isLoading } = useQuery({
    queryKey:  ['auditLogs', pumpId, page, pageSize, from, to],
    queryFn:   () => auditApi.getAuditLogs({
      pumpId: pumpId!,
      page,
      size: pageSize,
      from: from || undefined,
      to:   to   || undefined,
    }),
    enabled: !!pumpId,
  })

  const logs         = data?.content            ?? []
  const totalPages   = data?.page?.totalPages   ?? 0
  const totalEvents  = data?.page?.totalElements ?? 0
  const currentPage  = data?.page?.number       ?? page

  function handleFromChange(value: string) {
    setFrom(value)
    setPage(0)
  }

  function handleToChange(value: string) {
    setTo(value)
    setPage(0)
  }

  function handlePageSizeChange(value: number) {
    setPageSize(value)
    setPage(0)
  }

  function clearFilters() {
    setFrom('')
    setTo('')
    setPage(0)
  }

  const rangeStart = totalEvents === 0 ? 0 : currentPage * pageSize + 1
  const rangeEnd   = Math.min((currentPage + 1) * pageSize, totalEvents)

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Header ── */}
      <Reveal delay={60}>
      <div className="ui-page-header">
        <div>
        <h1 className="ui-title-sm">Audit Log</h1>
        <p className="ui-subtitle">
          Full history of all sensitive operations — who did what and when
        </p>
        </div>
      </div>
      </Reveal>

      {/* ── Filters row ── */}
      <Reveal delay={130}>
      <div className="ui-card ui-form-shell [grid-template-columns:repeat(3,minmax(0,1fr))_auto] items-end">
        <div className="flex flex-col gap-1">
          <label className="ui-label mb-0">From</label>
          <input
            type="date"
            value={from}
            onChange={e => handleFromChange(e.target.value)}
            max={to || undefined}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="ui-label mb-0">To</label>
          <input
            type="date"
            value={to}
            onChange={e => handleToChange(e.target.value)}
            min={from || undefined}
            className="text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="ui-label mb-0">Per page</label>
          <select
            value={pageSize}
            onChange={e => handlePageSizeChange(Number(e.target.value))}
            className="text-sm bg-white"
          >
            {PAGE_SIZE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>
        <button
          onClick={clearFilters}
          className={`ui-btn ui-btn-ghost text-xs ${(from || to) ? '' : 'invisible'}`}
        >
          Clear filter
        </button>
      </div>
      </Reveal>

      {/* ── Log list ── */}
      <Reveal delay={200}>
      <div className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <p className="ui-toolbar-title">
            {from || to ? 'Filtered Events' : 'All Events'} ({isLoading ? '…' : totalEvents})
          </p>
          {!isLoading && totalPages > 0 && (
            <p className="ui-toolbar-note">
              Page {currentPage + 1} of {totalPages}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="px-5 py-4"><SkeletonRows count={5} /></div>
        ) : logs.length === 0 ? (
          <p className="ui-empty px-5 py-6">
            No audit events found{from || to ? ' for the selected date range' : ''}.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_STYLES[log.action] ?? 'bg-slate-100 text-slate-600'}`}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-slate-500">by <span className="font-medium text-slate-700">{log.actorName}</span></span>
                  </div>
                  <p className="text-xs text-slate-400 flex-shrink-0">{fmtDateTime(log.createdAt)}</p>
                </div>
                <p className="text-sm text-slate-700">{log.description}</p>
                {log.entityId && (
                  <p className="text-xs text-slate-400 mt-0.5">{log.entityType} #{log.entityId}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Pagination controls — always shown when there's data ── */}
        {!isLoading && totalEvents > 0 && (
          <div className="px-5 pb-4">
            <Pagination
              data={{
                content: logs,
                page: currentPage,
                pageSize,
                totalElements: totalEvents,
                totalPages,
                hasNext: currentPage < totalPages - 1,
                hasPrevious: currentPage > 0,
              }}
              onPageChange={setPage}
              onPageSizeChange={handlePageSizeChange}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
            <div className="pt-2 text-center">
              <span className="text-xs text-slate-400">
                Showing {rangeStart}–{rangeEnd} of {totalEvents} events
              </span>
            </div>
          </div>
        )}
      </div>
      </Reveal>
    </div>
  )
}
