import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { shiftApi } from '../../api/shiftApi'
import type { ResolveDiscrepancyRequest } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { useAuthStore } from '../../store/authStore'
import type { Shift, CreditEntry, CreditEntryInput } from '../../types/shift'
import OpenShiftModal from './OpenShiftModal'
import CloseShiftModal from './CloseShiftModal'
import { SearchableSelect } from '../../components/SearchableSelect'
import { SkeletonRows } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { formatIstDate, formatIstDateTime } from '../../utils/date'
import { maskPhone } from '../../utils/maskPhone'
import { parseApiError } from '../../utils/apiError'
import { ModalPortal } from '../../components/ModalPortal'

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  OPEN:                          { label: 'Open',        color: 'bg-green-100 text-green-700' },
  OPEN_OVERDUE:                  { label: 'Overdue',     color: 'bg-amber-100 text-amber-700' },
  AUTO_CLOSED_OVERDUE:           { label: 'Auto-closed', color: 'bg-red-100 text-red-700' },
  CLOSED_BALANCED:               { label: 'Balanced',    color: 'bg-slate-100 text-slate-600' },
  CLOSED_DISCREPANCY_PENDING:    { label: 'Discrepancy', color: 'bg-red-100 text-red-700' },
  CLOSED_DISCREPANCY_RESOLVED:   { label: 'Resolved',    color: 'bg-slate-100 text-slate-600' },
}

const PAGE_SIZE = 10

// ── Date helpers ─────────────────────────────────────────────────────────────

// Use LOCAL calendar date, not UTC — toISOString() returns UTC which mismatches
// the backend shiftDate (set in local/IST time) for users in UTC+ timezones.
function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function labelForDate(d: string): string {
  const todayStr     = localDateStr(new Date())
  const yesterdayStr = localDateStr(new Date(Date.now() - 86_400_000))
  const dayBeforeStr = localDateStr(new Date(Date.now() - 2 * 86_400_000))
  if (d === todayStr)     return 'Today'
  if (d === yesterdayStr) return 'Yesterday'
  if (d === dayBeforeStr) return 'Day Before Yesterday'
  return formatIstDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtAmt(n: number | null | undefined) {
  return n != null
    ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : '—'
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const { selectedPumpId } = usePumpStore()
  const [showOpenModal,  setShowOpenModal]  = useState(false)
  const [shiftToClose,   setShiftToClose]   = useState<Shift | null>(null)
  const [shiftForCredit, setShiftForCredit] = useState<Shift | null>(null)
  const [historyOpen,    setHistoryOpen]    = useState(true)
  const [historyTab,     setHistoryTab]     = useState<'day' | 'all'>('day')

  const { data: rawPumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    enabled:  isOwnerOrAdmin,
  })

  // Sort alphabetically once
  const sortedPumps = [...rawPumps].sort((a, b) => a.name.localeCompare(b.name))

  const pumpId = selectedPumpId

  const { data: activeShifts = [], isLoading: activeLoading, isFetching: activeFetching, dataUpdatedAt: activeUpdatedAt } = useQuery({
    queryKey:      ['activeShifts', pumpId],
    queryFn:       () => shiftApi.getActiveShifts(pumpId!),
    enabled:       !!pumpId,
    refetchInterval: 30_000,
  })

  const { data: historyShifts = [], isLoading: historyLoading } = useQuery({
    queryKey: ['shiftHistory', pumpId],
    queryFn:  () => shiftApi.getShiftHistory(pumpId!),
    enabled:  !!pumpId && historyOpen,
  })

  // ── Early exits ──────────────────────────────────────────────────────────

  if (isOwnerOrAdmin && sortedPumps.length === 0 && rawPumps.length === 0) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning p-6 text-center">
          <p className="text-amber-800 font-medium mb-2">No pumps set up yet</p>
          <p className="text-amber-700 text-sm mb-4">
            Create a pump location first, then add nozzles and set fuel prices.
          </p>
          <Link to="/dashboard/setup"
            className="ui-btn ui-btn-primary inline-flex">
            Go to Setup
          </Link>
        </div>
      </div>
    )
  }

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning text-sm">
          You are not assigned to any pump. Ask the Owner or Admin to assign you.
        </div>
      </div>
    )
  }

  const selectedPump = sortedPumps.find((p) => p.id === pumpId)

  return (
    <div className="ui-page ui-page--narrow space-y-6">

      {/* Page title */}
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Shift control</p>
          <h2 className="ui-title-sm">Shifts</h2>
          <p className="ui-subtitle">Open and close operator shifts, record meter readings and payment collection.</p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Open now</span>
            <span className="ui-section-meta-value">{activeLoading ? '…' : activeShifts.length}</span>
          </div>
        </div>
      </div>
      </Reveal>

      {!pumpId ? (
        <div className="ui-card text-center text-sm text-slate-400">
          No pump selected. Use the pump selector in the top navigation bar.
        </div>
      ) : (
        <>
          {/* ── Active Shifts ──────────────────────────────────────────────── */}
          <div className="ui-card overflow-hidden p-0">
            <div className="ui-toolbar">
              <div className="flex items-center gap-2.5">
                <h2 className="ui-toolbar-title">Active Shifts</h2>
                <RefreshIndicator isFetching={activeFetching} dataUpdatedAt={activeUpdatedAt ?? 0} />
              </div>
              {selectedPump && (
                <p className="text-xs text-slate-400">{selectedPump.name}</p>
              )}
              <button
                onClick={() => setShowOpenModal(true)}
                className="ui-btn ui-btn-primary ml-auto"
              >
                + Open Shift
              </button>
            </div>

            {activeLoading ? (
              <div className="px-5 py-4"><SkeletonRows count={3} /></div>
            ) : activeShifts.length === 0 ? (
              <div className="ui-empty p-6">
                No active shifts. Click "+ Open Shift" to start one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="text-left px-6 py-3 font-medium">Nozzle</th>
                      <th className="text-left px-6 py-3 font-medium">Operator</th>
                      <th className="text-left px-6 py-3 font-medium">Window</th>
                      <th className="text-left px-6 py-3 font-medium">Started</th>
                      <th className="text-left px-6 py-3 font-medium">Prices (₹)</th>
                      <th className="text-left px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeShifts.map((shift) => (
                      <ShiftRow
                        key={shift.id}
                        shift={shift}
                        onClose={() => setShiftToClose(shift)}
                        onAddCredit={() => setShiftForCredit(shift)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Shift History ──────────────────────────────────────────────── */}
          <div className="ui-card overflow-hidden p-0">
            {/* Header / toggle */}
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
            >
              <span className="text-base font-semibold text-slate-800">Shift History</span>
              <span className={`ui-accordion-arrow ${historyOpen ? 'ui-accordion-arrow--open' : ''}`}>▼</span>
            </button>

            {historyOpen && (
              <div className="ui-accordion-content">
                {/* Tab row */}
                <div className="ui-tabbar">
                  {(['day', 'all'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setHistoryTab(tab)}
                      className={`ui-tabbar__button ${historyTab === tab ? 'ui-tabbar__button--active' : ''}`}
                    >
                      {tab === 'day' ? 'By Day' : 'All Shifts'}
                    </button>
                  ))}
                </div>

                <div key={historyLoading ? 'loading' : historyTab} className="ui-tab-content">
                  {historyLoading ? (
                    <div className="px-5 py-4"><SkeletonRows count={4} /></div>
                  ) : historyShifts.length === 0 ? (
                    <div className="ui-empty p-6">No shift history yet.</div>
                  ) : historyTab === 'day' ? (
                    <DayViewHistory shifts={historyShifts} />
                  ) : (
                    <AllShiftsHistory shifts={historyShifts} />
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {showOpenModal && pumpId && (
        <OpenShiftModal
          pumpId={pumpId}
          activeShifts={activeShifts}
          onClose={() => setShowOpenModal(false)}
        />
      )}
      {shiftToClose && (
        <CloseShiftModal shift={shiftToClose} onClose={() => setShiftToClose(null)} />
      )}
      {shiftForCredit && (
        <AddCreditEntryModal
          shift={shiftForCredit}
          onClose={() => setShiftForCredit(null)}
        />
      )}
    </div>
  )
}

// ── Day View ──────────────────────────────────────────────────────────────────

function DayViewHistory({ shifts }: { shifts: Shift[] }) {
  const [todayStr]     = useState(() => localDateStr(new Date()))
  const [yesterdayStr] = useState(() => localDateStr(new Date(Date.now() - 86_400_000)))
  const [dayBeforeStr] = useState(() => localDateStr(new Date(Date.now() - 2 * 86_400_000)))

  // Group by shiftDate
  const grouped = shifts.reduce<Record<string, Shift[]>>((acc, s) => {
    ;(acc[s.shiftDate] ??= []).push(s)
    return acc
  }, {})

  // Only show the 3 most recent days: today, yesterday, day before yesterday
  const visibleDates = [todayStr, yesterdayStr, dayBeforeStr].filter(d => grouped[d])

  // Today is open by default; rest start collapsed
  const [openDays, setOpenDays] = useState<Set<string>>(new Set([todayStr]))

  const toggle = (d: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev)
      next.has(d) ? next.delete(d) : next.add(d)
      return next
    })

  const fmtShortDate = (d: string) =>
    formatIstDate(d, { day: 'numeric', month: 'short', year: 'numeric' })

  if (visibleDates.length === 0) {
    return <p className="ui-empty px-6 py-6">No shift history for the last 3 days.</p>
  }

  return (
    <div className="divide-y divide-slate-100">
      {visibleDates.map((date) => {
        const dayShifts = grouped[date]
        const isOpen    = openDays.has(date)
        const totalAmt  = dayShifts.reduce((s, sh) => s + (sh.totalAmountDue ?? 0), 0)
        const label     = labelForDate(date)
        const isToday   = date === todayStr

        return (
          <div key={date}>
            {/* Day accordion header */}
            <button
              onClick={() => toggle(date)}
              className="w-full flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${isToday ? 'text-blue-700' : 'text-slate-700'}`}>
                  {label}
                </span>
                <span className="text-xs text-slate-400">{fmtShortDate(date)}</span>
                <span className="text-xs text-slate-400">
                  · {dayShifts.length} shift{dayShifts.length !== 1 ? 's' : ''}
                </span>
                {totalAmt > 0 && (
                  <span className="text-xs font-medium text-slate-600">
                    · {fmtAmt(totalAmt)}
                  </span>
                )}
                {isToday && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    Today
                  </span>
                )}
              </div>
              <span className={`ui-accordion-arrow ${isOpen ? 'ui-accordion-arrow--open' : ''}`}>▼</span>
            </button>

            {/* Day shift table */}
            {isOpen && (
              <div className="ui-accordion-content overflow-x-auto border-t border-slate-100 bg-slate-50/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th className="text-left px-5 py-2.5 font-medium">ID</th>
                      <th className="text-left px-5 py-2.5 font-medium">Nozzle</th>
                      <th className="text-left px-5 py-2.5 font-medium">Shift</th>
                      <th className="text-left px-5 py-2.5 font-medium">Operator</th>
                      <th className="text-left px-5 py-2.5 font-medium">Date</th>
                      <th className="text-left px-5 py-2.5 font-medium">Amount Due</th>
                      <th className="text-left px-5 py-2.5 font-medium">Status</th>
                      <th className="text-left px-5 py-2.5 font-medium">Discrepancy</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {dayShifts.map((shift) => (
                      <HistoryRow key={shift.id} shift={shift} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── All Shifts (paginated + date range filter) ────────────────────────────────

function AllShiftsHistory({ shifts }: { shifts: Shift[] }) {
  const [page,     setPage]     = useState(0)
  const [fromDate, setFromDate] = useState(() => localDateStr(new Date(Date.now() - 86_400_000)))
  const [toDate,   setToDate]   = useState(() => localDateStr(new Date()))

  const filtered = shifts.filter((s) => {
    if (fromDate && s.shiftDate < fromDate) return false
    if (toDate   && s.shiftDate > toDate)   return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Reset to page 0 when filter changes
  const safePage   = Math.min(page, totalPages - 1)
  const paged      = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const clearFilter = () => { setFromDate(''); setToDate(''); setPage(0) }

  return (
    <div>
      {/* Date range filter bar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-t border-slate-100 bg-slate-50/60">
        <span className="text-xs font-medium text-slate-500">Filter by date:</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(0) }}
            className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
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
        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} shift{filtered.length !== 1 ? 's' : ''}
          {(fromDate || toDate) ? ' (filtered)' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border-t border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="text-left px-5 py-3 font-medium">ID</th>
              <th className="text-left px-5 py-3 font-medium">Nozzle</th>
              <th className="text-left px-5 py-3 font-medium">Shift</th>
              <th className="text-left px-5 py-3 font-medium">Operator</th>
              <th className="text-left px-5 py-3 font-medium">Date</th>
              <th className="text-left px-5 py-3 font-medium">Amount Due</th>
              <th className="text-left px-5 py-3 font-medium">Status</th>
              <th className="text-left px-5 py-3 font-medium">Discrepancy</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
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
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/60">
          <span className="text-xs text-slate-500">
            Page {safePage + 1} of {totalPages}
            <span className="ml-2 text-slate-400">
              (showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length})
            </span>
          </span>
          <div className="flex gap-1">
            <button
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
            <button
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

// ── Active shift row ──────────────────────────────────────────────────────────

function ShiftRow({ shift, onClose, onAddCredit }: { shift: Shift; onClose: () => void; onAddCredit: () => void }) {
  const badge     = STATUS_LABELS[shift.status] ?? { label: shift.status, color: 'bg-slate-100 text-slate-600' }
  const startTime = formatIstDateTime(shift.actualStartTime, { hour: '2-digit', minute: '2-digit' })
  const fuelAbbr: Record<string, string> = {
    PETROL: 'P', SPEED_PETROL: 'SP', DIESEL: 'D', SPEED_DIESEL: 'SD', CNG: 'CNG',
  }
  const prices = shift.fuelReadings
    .map((r) => `${fuelAbbr[r.fuelType] ?? r.fuelType}:₹${r.priceSnapshot}`)
    .join(' · ')

  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50">
      <td className="px-6 py-3 font-medium text-slate-700">
        <span className="text-xs text-slate-400 block">
          {shift.duName ?? `DU #${shift.duNumber}`}
        </span>
        {shift.nozzles.map((n) => `#${n.nozzleNumber} ${n.fuelType}`).join(', ')}
      </td>
      <td className="px-6 py-3 text-slate-600">{shift.operatorName}</td>
      <td className="px-6 py-3 text-slate-500">{shift.shiftWindow}</td>
      <td className="px-6 py-3 text-slate-500">{startTime}</td>
      <td className="px-6 py-3 text-slate-500 text-xs">{prices || '—'}</td>
      <td className="px-6 py-3">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${badge.color}`}>{badge.label}</span>
      </td>
      <td className="px-6 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onAddCredit}
            className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100"
          >
            <span className="text-sm leading-none">+</span>
            <span>Credit</span>
          </button>
          <button
            onClick={onClose}
            className="ui-btn ui-btn-primary min-h-0 rounded-xl px-3 py-1.5 text-xs"
          >
            Close
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── History row ───────────────────────────────────────────────────────────────
// Payment breakdown is always visible for closed shifts.
// Credit amount is clickable — opens a popup modal listing all client credit entries.

function HistoryRow({ shift }: { shift: Shift }) {
  const { user } = useAuthStore()
  const canResolve = user?.role === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const [creditModalOpen,    setCreditModalOpen]    = useState(false)
  const [resolveModalOpen,   setResolveModalOpen]   = useState(false)

  const badge            = STATUS_LABELS[shift.status] ?? { label: shift.status, color: 'bg-slate-100 text-slate-600' }
  const isClosed         = shift.totalAmountDue != null
  const digitalTotal     = (shift.upiCollected ?? 0) + (shift.cardCollected ?? 0)
  const hasCreditEntries = (shift.creditEntries?.length ?? 0) > 0
  const creditAmt        = shift.creditTotal ?? 0
  const isPendingResolution = shift.status === 'CLOSED_DISCREPANCY_PENDING'

  return (
    <>
      {/* ── Main data row ─────────────────────────────────────────────────── */}
      <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors">
        <td className="px-5 py-3 text-slate-400 text-xs font-mono">{shift.id}</td>
        <td className="px-5 py-3">
          <span className="text-xs text-slate-400 block">
            {shift.duName ?? `DU #${shift.duNumber}`}
          </span>
          <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">
            {shift.nozzles.map((n) => `#${n.nozzleNumber} ${n.fuelType}`).join(', ')}
          </span>
        </td>
        <td className="px-5 py-3">
          {shift.shiftWindow ? (
            <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
              {shift.shiftWindow}
            </span>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )}
        </td>
        <td className="px-5 py-3 text-sm text-slate-700 font-medium">{shift.operatorName}</td>
        <td className="px-5 py-3 text-xs text-slate-400">{shift.shiftDate}</td>
        <td className="px-5 py-3 text-sm font-semibold text-slate-800">
          {fmtAmt(shift.totalAmountDue)}
        </td>
        <td className="px-5 py-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
        </td>
        <td className="px-5 py-3">
          {shift.discrepancyAmount != null ? (
            <span className={`text-xs font-semibold ${
              shift.discrepancyType === 'SHORT' ? 'text-red-600' : 'text-amber-600'
            }`}>
              {shift.discrepancyType} {fmtAmt(shift.discrepancyAmount)}
            </span>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {isPendingResolution && canResolve && (
            <button
              onClick={() => setResolveModalOpen(true)}
              className="ui-btn ui-btn-danger min-h-0 px-3 py-1.5 text-xs"
            >
              Resolve
            </button>
          )}
          {shift.discrepancyResolution && (
            <span className="text-xs text-slate-400">{shift.discrepancyResolution.replace(/_/g, ' ')}</span>
          )}
        </td>
      </tr>

      {/* ── Payment breakdown row — always visible for closed shifts ──────── */}
      {isClosed && (
        <tr className="border-b border-slate-100 bg-slate-50/40">
          <td colSpan={9} className="px-5 pb-3 pt-1">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">

              {/* Cash */}
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-500">Cash</span>
                <span className="font-semibold text-slate-700">{fmtAmt(shift.cashCollected)}</span>
              </div>

              {/* UPI + Card */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <span className="text-slate-500">UPI + Card</span>
                <span className="font-semibold text-slate-700">
                  {digitalTotal > 0 ? fmtAmt(digitalTotal) : '—'}
                </span>
                {(shift.upiCollected ?? 0) > 0 && (
                  <span className="text-slate-400 bg-blue-50 px-1.5 py-0.5 rounded">
                    UPI {fmtAmt(shift.upiCollected)}
                  </span>
                )}
                {(shift.cardCollected ?? 0) > 0 && (
                  <span className="text-slate-400 bg-blue-50 px-1.5 py-0.5 rounded">
                    Card {fmtAmt(shift.cardCollected)}
                  </span>
                )}
              </div>

              {/* Credit — clickable pill that opens the modal */}
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                <span className="text-slate-500">Credit</span>
                {creditAmt > 0 ? (
                  hasCreditEntries ? (
                    <button
                      type="button"
                      onClick={() => setCreditModalOpen(true)}
                      className="flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
                      title="Click to view credit details"
                    >
                      {fmtAmt(creditAmt)}
                      <span className="text-orange-500 text-xs">
                        · {shift.creditEntries.length} client{shift.creditEntries.length !== 1 ? 's' : ''} ↗
                      </span>
                    </button>
                  ) : (
                    <span className="font-semibold text-orange-700">{fmtAmt(creditAmt)}</span>
                  )
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* ── Credit entries popup modal ─────────────────────────────────────── */}
      {creditModalOpen && hasCreditEntries && (
        <CreditEntriesModal
          shift={shift}
          entries={shift.creditEntries}
          creditTotal={creditAmt}
          onClose={() => setCreditModalOpen(false)}
        />
      )}

      {/* ── Resolve discrepancy modal ──────────────────────────────────────── */}
      {resolveModalOpen && (
        <ResolveDiscrepancyModal
          shift={shift}
          onClose={() => setResolveModalOpen(false)}
        />
      )}
    </>
  )
}

// ── Credit entries modal ───────────────────────────────────────────────────────

function CreditEntriesModal({
  shift,
  entries,
  creditTotal,
  onClose,
}: {
  shift: Shift
  entries: CreditEntry[]
  creditTotal: number
  onClose: () => void
}) {
  return (
    <tr>
      <td colSpan={8} className="p-0">
        <ModalPortal>
        <div
          className="ui-modal-backdrop"
          onClick={onClose}
        >
          <div
            className="ui-modal-panel w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Credit Sales</h2>
                <p className="ui-modal-subtitle">
                  Shift #{shift.id} · Nozzle {shift.nozzles.map((n) => `#${n.nozzleNumber}`).join(', ')} · {shift.operatorName} · {shift.shiftDate}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="ui-btn ui-btn-ghost ui-modal-close"
              >
                ×
              </button>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-orange-100 text-xs">
                  {entries.length} {entries.length === 1 ? 'client' : 'clients'} with outstanding credit
                </span>
                <span className="bg-white/20 text-white text-sm font-bold px-3 py-1 rounded-full">
                  {fmtAmt(creditTotal)} total
                </span>
              </div>
            </div>

            {/* Entry list */}
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {entries.map((entry, idx) => (
                <div key={entry.id} className="flex items-start gap-3 px-5 py-3.5">
                  {/* Index badge */}
                  <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{entry.clientName}</p>
                      {entry.fuelType && (
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          entry.fuelType === 'PETROL'
                            ? 'bg-green-100 text-green-700'
                            : entry.fuelType === 'DIESEL'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {entry.fuelType}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {entry.billNo ? (
                        <span className="text-xs text-slate-400">
                          Bill: <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">{entry.billNo}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">No bill</span>
                      )}
                      {entry.description && (
                        <span className="text-xs text-slate-500 italic">"{entry.description}"</span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <span className="text-sm font-bold text-orange-700 shrink-0">
                    ₹{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer total */}
            <div className="bg-orange-50 border-t border-orange-200 px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-orange-800">Total Credit</span>
              <span className="text-base font-bold text-orange-800">{fmtAmt(creditTotal)}</span>
            </div>
          </div>
        </div>
        </ModalPortal>
      </td>
    </tr>
  )
}

// ── Resolve Discrepancy Modal ─────────────────────────────────────────────────

const RESOLUTION_OPTIONS = [
  { value: 'PENDING_INVESTIGATION', label: 'Pending Investigation' },
  { value: 'SALARY_DEDUCTION',      label: 'Salary Deduction' },
  { value: 'CASH_RECOVERY',         label: 'Cash Recovery' },
  { value: 'WAIVED',                label: 'Waived' },
]

function ResolveDiscrepancyModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const qc = useQueryClient()
  const [action, setAction] = useState<ResolveDiscrepancyRequest['resolutionAction']>('PENDING_INVESTIGATION')
  const [note,   setNote]   = useState('')
  const [error,  setError]  = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (req: ResolveDiscrepancyRequest) => shiftApi.resolveDiscrepancy(shift.pumpId, shift.id, req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shiftHistory', shift.pumpId] })
      onClose()
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to resolve discrepancy. Please try again.')),
  })

  const handleSubmit = () => {
    if (action === 'WAIVED' && !note.trim()) {
      setError('A written reason is required when waiving a discrepancy.')
      return
    }
    setError(null)
    mutation.mutate({ resolutionAction: action, resolutionNote: note.trim() || undefined })
  }

  const discType  = shift.discrepancyType
  const discAmt   = shift.discrepancyAmount

  return (
    <tr>
      <td colSpan={8} className="p-0">
        <ModalPortal>
        <div className="ui-modal-backdrop" onClick={onClose}>
          <div className="ui-modal-panel w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--danger">
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Resolve Discrepancy</h2>
                <p className="ui-modal-subtitle">
                  Shift #{shift.id} · {discType} ₹{discAmt?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">×</button>
            </div>

            <div className="ui-modal-body space-y-4">
              <div>
                <label className="ui-label">Resolution Action</label>
                <SearchableSelect
                  value={action}
                  onChange={(v) => setAction(v as ResolveDiscrepancyRequest['resolutionAction'])}
                  options={RESOLUTION_OPTIONS}
                />
              </div>
              <div>
                <label className="ui-label">
                  Note {action === 'WAIVED' && <span className="text-red-500">* required</span>}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Enter justification or notes…"
                  className="resize-none text-sm"
                />
              </div>
              {error && <p className="ui-error-text">{error}</p>}
              <div className="ui-modal-footer -mx-6 -mb-6">
                <button onClick={onClose} className="ui-btn ui-btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={mutation.isPending}
                  className="ui-btn ui-btn-danger flex-1 disabled:bg-red-300"
                >
                  {mutation.isPending ? 'Saving…' : 'Confirm Resolution'}
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      </td>
    </tr>
  )
}

// ── Add Credit Entry Modal (mid-shift) ────────────────────────────────────────

const FUEL_LABELS_MAP: Record<string, string> = {
  PETROL: 'Petrol', SPEED_PETROL: 'Speed Petrol',
  DIESEL: 'Diesel', SPEED_DIESEL: 'Speed Diesel', CNG: 'CNG',
}

function AddCreditEntryModal({ shift, onClose }: { shift: Shift; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: creditClients = [] } = useQuery({
    queryKey: ['creditClients', shift.pumpId],
    queryFn: () => pumpApi.getCreditClients(shift.pumpId),
  })

  const [clientSearch,   setClientSearch]   = useState('')
  const [clientName,     setClientName]     = useState('')
  const [clientId,       setClientId]       = useState<number | null>(null)
  const [subAccountId,   setSubAccountId]   = useState<number | null>(null)
  const [showDropdown,   setShowDropdown]   = useState(false)
  const [fuelType,       setFuelType]       = useState<string>(shift.fuelReadings[0]?.fuelType ?? '')
  const [amount,         setAmount]         = useState('')
  const [liters,         setLiters]         = useState('')
  const [inputMode,      setInputMode]      = useState<'amount' | 'liters'>('amount')
  const [billNo,         setBillNo]         = useState('')
  const [description,    setDescription]    = useState('')
  const [error,          setError]          = useState<string | null>(null)

  const priceForFuelType = (ft: string): number | null =>
    shift.fuelReadings.find((r) => r.fuelType === ft)?.priceSnapshot ?? null

  // Void credit entry state
  const [voidTargetId,  setVoidTargetId]   = useState<number | null>(null)
  const [voidReason,    setVoidReason]     = useState('')
  const [voidError,     setVoidError]      = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (entry: CreditEntryInput) => shiftApi.addCreditEntry(shift.pumpId, shift.id, entry),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
      onClose()
    },
    onError: (err: unknown) => setError(parseApiError(err, 'Failed to save credit entry. Please try again.')),
  })

  const voidMutation = useMutation({
    mutationFn: ({ entryId, reason }: { entryId: number; reason: string }) =>
      shiftApi.voidCreditEntry(shift.pumpId, shift.id, entryId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activeShifts', shift.pumpId] })
      setVoidTargetId(null); setVoidReason(''); setVoidError(null)
    },
    onError: (err: unknown) => setVoidError(parseApiError(err, 'Failed to delete entry. Please try again.')),
  })

  const rootClients = creditClients.filter(c => c.parentClientId === null)
  const filtered = rootClients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  )
  const selectedParent = creditClients.find(c => c.id === clientId)
  const subAccounts = selectedParent?.isParent
    ? creditClients.filter(c => c.parentClientId === clientId)
    : []

  const canSave =
    clientName.trim().length > 0 &&
    fuelType.length > 0 &&
    parseFloat(amount) > 0

  const handleSubmit = () => {
    const amt = parseFloat(amount)
    if (!clientName.trim()) { setError('Client name is required'); return }
    if (!fuelType)           { setError('Fuel type is required'); return }
    if (!amount || isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    setError(null)
    mutation.mutate({
      clientId:    subAccountId ?? clientId ?? undefined,
      clientName: clientName.trim(),
      fuelType,
      amount: amt,
      billNo:      billNo.trim() || undefined,
      description: description.trim() || undefined,
    })
  }

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel w-full max-w-md overflow-hidden">
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--warning">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Add Credit Entry</h2>
            <p className="ui-modal-subtitle">
              Nozzle {shift.nozzles.map((n) => `#${n.nozzleNumber}`).join(', ')} · {shift.operatorName}
            </p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">×</button>
        </div>

        <div className="ui-modal-body space-y-3">

          {/* Existing credit entries with void option */}
          {shift.creditEntries.length > 0 && (
            <div className="ui-card p-0 overflow-hidden">
              <div className="ui-toolbar px-3 py-2">
                <p className="ui-toolbar-title text-xs">Recorded entries</p>
                <span className="ui-toolbar-note">Click Void to cancel one</span>
              </div>
              <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                {shift.creditEntries.map((entry) => (
                  <div key={entry.id} className={`flex items-center gap-2 px-3 py-2 ${entry.voidStatus === 'VOIDED' ? 'opacity-40' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{entry.clientName}</p>
                      <p className="text-xs text-slate-400">
                        ₹{entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        {entry.fuelType && ` · ${entry.fuelType}`}
                        {entry.voidStatus === 'VOIDED' && ' · VOIDED'}
                      </p>
                    </div>
                    {entry.voidStatus !== 'VOIDED' && voidTargetId !== entry.id && (
                      <button
                        onClick={() => { setVoidTargetId(entry.id); setVoidReason(''); setVoidError(null) }}
                        className="ui-btn ui-btn-ghost min-h-0 shrink-0 border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:border-red-300 hover:text-red-700"
                      >
                        Void
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {/* Void reason input */}
              {voidTargetId !== null && (
                <div className="border-t border-orange-200 bg-orange-50 px-3 py-2">
                  <div className="ui-inline-form space-y-2 border-orange-200 bg-white/70">
                  <input
                    autoFocus
                    type="text"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Reason for voiding (required)"
                    className="ui-input-compact text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                  {voidError && <p className="ui-error-text">{voidError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => { setVoidTargetId(null); setVoidReason('') }}
                      className="ui-btn ui-btn-secondary min-h-0 flex-1 px-3 py-1 text-xs">
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (!voidReason.trim()) { setVoidError('Reason is required'); return }
                        voidMutation.mutate({ entryId: voidTargetId!, reason: voidReason.trim() })
                      }}
                      disabled={voidMutation.isPending}
                      className="ui-btn ui-btn-danger min-h-0 flex-1 px-3 py-1 text-xs disabled:opacity-50">
                      {voidMutation.isPending ? '…' : 'Confirm Void'}
                    </button>
                  </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Client — root/parent accounts only */}
          <div className="ui-search-shell">
            <label className="ui-label">
              Client <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value)
                setClientName(e.target.value)
                setClientId(null)
                setSubAccountId(null)
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Search client name…"
              className="text-sm"
            />
            {showDropdown && rootClients.length > 0 && (
              <div className="ui-card absolute top-full left-0 right-0 z-50 mt-0.5 max-h-36 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                  <p className="ui-empty px-3 py-2">No match — add client in Setup.</p>
                ) : (
                  filtered.map((c) => (
                    <button key={c.id} type="button"
                      onMouseDown={() => {
                        setClientSearch(c.name)
                        setClientName(c.name)
                        setClientId(c.id)
                        setSubAccountId(null)
                        setShowDropdown(false)
                      }}
                      className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-orange-50 flex items-center justify-between">
                      <span className="font-medium text-slate-700">{c.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.isParent && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                            has sub-accounts
                          </span>
                        )}
                        {c.phone && <span className="text-xs text-slate-400">{maskPhone(c.phone)}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Sub-account picker — shown when selected parent has children */}
          {subAccounts.length > 0 && (
            <div>
              <label className="ui-label">
                Sub-account <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <SearchableSelect
                value={subAccountId != null ? subAccountId.toString() : ''}
                onChange={v => setSubAccountId(v === '' ? null : Number(v))}
                placeholder={`— Bill to parent (${clientName}) —`}
                accentColor="orange"
                options={subAccounts.map(s => ({ value: s.id.toString(), label: s.name }))}
              />
            </div>
          )}

          {/* Fuel + Amount/Liters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ui-label">
                Fuel <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                value={fuelType}
                onChange={v => {
                  setFuelType(v)
                  if (inputMode === 'liters') { setAmount(''); setLiters('') }
                }}
                accentColor="orange"
                options={shift.fuelReadings.map(r => ({
                  value: r.fuelType,
                  label: FUEL_LABELS_MAP[r.fuelType] ?? r.fuelType,
                }))}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="ui-label mb-0">
                  {inputMode === 'amount' ? 'Amount (₹)' : 'Liters'}{' '}
                  <span className="text-red-500">*</span>
                </label>
                <div className="flex rounded border border-slate-200 overflow-hidden text-xs">
                  <button type="button"
                    onClick={() => { setInputMode('amount'); setLiters('') }}
                    className={`px-2 py-0.5 font-medium transition-colors ${inputMode === 'amount' ? 'bg-orange-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}>
                    ₹
                  </button>
                  <button type="button"
                    onClick={() => {
                      const price = priceForFuelType(fuelType)
                      const initLiters = price && amount ? (parseFloat(amount) / price).toFixed(3) : ''
                      setInputMode('liters')
                      setLiters(initLiters)
                    }}
                    disabled={!priceForFuelType(fuelType)}
                    className={`px-2 py-0.5 font-medium transition-colors ${inputMode === 'liters' ? 'bg-orange-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    L
                  </button>
                </div>
              </div>
              {inputMode === 'amount' ? (
                <>
                  <input type="number" step="0.01" min="0.01" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="text-sm" />
                  {(() => {
                    const price = priceForFuelType(fuelType)
                    const unit = fuelType === 'CNG' ? 'kg' : 'L'
                    const litersCalc = price && amount ? (parseFloat(amount) / price) : null
                    return litersCalc ? (
                      <p className="text-xs text-slate-400 mt-1">
                        {litersCalc.toFixed(3)} {unit} × ₹{price} = ₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ) : null
                  })()}
                </>
              ) : (
                <>
                  <input type="number" step="0.001" min="0.001" value={liters}
                    onChange={(e) => {
                      const price = priceForFuelType(fuelType)
                      const amt = price && e.target.value ? (parseFloat(e.target.value) * price).toFixed(2) : ''
                      setLiters(e.target.value)
                      setAmount(amt)
                    }}
                    placeholder="0.000"
                    className="text-sm" />
                  {liters && amount && (() => {
                    const price = priceForFuelType(fuelType)
                    const unit = fuelType === 'CNG' ? 'kg' : 'L'
                    return price ? (
                      <p className="text-xs text-emerald-600 mt-1 font-medium">
                        {parseFloat(liters).toFixed(3)} {unit} × ₹{price} = ₹{parseFloat(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    ) : null
                  })()}
                </>
              )}
            </div>
          </div>

          {/* Bill No + Description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ui-label">Bill No</label>
              <input type="text" value={billNo} onChange={(e) => setBillNo(e.target.value)}
                placeholder="e.g. B-101"
                className="text-sm" />
            </div>
            <div>
              <label className="ui-label">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. given to driver"
                className="text-sm" />
            </div>
          </div>

          {error && (
            <div className="ui-alert ui-alert-danger text-sm">{error}</div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button onClick={onClose}
            className="ui-btn ui-btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!canSave || mutation.isPending}
            className="ui-btn ui-btn-primary flex-1 disabled:bg-slate-300 disabled:text-slate-400 disabled:cursor-not-allowed">
            {mutation.isPending ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
