import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { usePumpStore } from '../../store/usePumpStore'
import { userApi } from '../../api/userApi'
import { payrollApi } from '../../api/payrollApi'
import type { GeneratePayrollRequest, PayrollRecord, PayrollStatus, PendingDiscrepancy } from '../../api/payrollApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { formatIstDate, localDateInputValue } from '../../utils/date'
import { SkeletonTable } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { useEscapeKey } from '../../hooks/useEscapeKey'

const STATUS_STYLES: Record<PayrollStatus, string> = {
  DRAFT:    'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  PAID:     'bg-emerald-100 text-emerald-700',
}

// Order in which status groups are displayed
const STATUS_ORDER: PayrollStatus[] = ['DRAFT', 'APPROVED', 'PAID']

const NEXT_STATUS: Partial<Record<PayrollStatus, PayrollStatus>> = {
  DRAFT:    'APPROVED',
  APPROVED: 'PAID',
}

function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return formatIstDate(d)
}

/** Returns "2026-04" from a date string */
function toMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** Returns "Apr 2026" from "2026-04" */
function fmtMonthKey(key: string): string {
  const [year, month] = key.split('-')
  return new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', year: 'numeric' })
}

function todayIso()     { return localDateInputValue() }
function yesterdayIso() { return localDateInputValue(-1) }

// ── Review + Discrepancy Modal ────────────────────────────────────────────────

interface ReviewModalProps {
  form: GeneratePayrollRequest
  selectedStaff: any
  pumpId: number
  formError: string | null
  isPending: boolean
  onClose: () => void
  onGenerate: (deductIds: number[]) => void
}

function ReviewModal({ form, selectedStaff, pumpId, formError, isPending, onClose, onGenerate }: ReviewModalProps) {
  useEscapeKey(onClose)
  const [deductSet, setDeductSet] = useState<Set<number>>(new Set())

  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-discrepancies', pumpId, form.userId],
    queryFn: () => payrollApi.getPendingDiscrepancies(pumpId, form.userId),
    enabled: form.userId > 0,
  })

  const toggleDeduct = (id: number) =>
    setDeductSet(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const totalDeductAmt = pending
    .filter(d => deductSet.has(d.id))
    .reduce((s, d) => s + d.discrepancyAmount, 0)

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal-panel w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Review Payroll</h2>
            <p className="ui-modal-subtitle">Verify the details and handle any pending discrepancies.</p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
        </div>

        <div className="ui-modal-body space-y-4">
          {formError && (
            <div className="ui-alert ui-alert-danger text-sm">{formError} Go back to modify the data and try again.</div>
          )}

          {/* Summary */}
          <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-slate-500 text-xs">Staff Member</span>
              <span className="font-medium text-slate-800">{selectedStaff ? `${selectedStaff.fullName} — ${selectedStaff.role}` : '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-slate-500 text-xs">Period</span>
              <span className="font-medium text-slate-800">{fmtDate(form.periodFrom)} – {fmtDate(form.periodTo)}</span>
            </div>
            {form.notes?.trim() && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-slate-500 text-xs">Notes</span>
                <span className="font-medium text-slate-800">{form.notes}</span>
              </div>
            )}
          </div>

          {/* Pending discrepancies */}
          {pendingLoading ? (
            <div className="text-xs text-slate-400 px-1">Checking pending discrepancies…</div>
          ) : pending.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Pending Discrepancies ({pending.length})
                </p>
                <p className="text-xs text-slate-400">Toggle to deduct from this salary</p>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {pending.map((d: PendingDiscrepancy) => {
                  const isDeduct = deductSet.has(d.id)
                  return (
                    <div
                      key={d.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${isDeduct ? 'bg-red-50/60' : 'bg-white hover:bg-slate-50'}`}
                    >
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-slate-400">#{d.id}</span>
                          <span className="text-xs text-slate-600">{d.shiftDate}</span>
                          {(d.duName || d.duNumber != null) && (
                            <span className="text-xs text-slate-500">{d.duName ?? `DU #${d.duNumber}`}</span>
                          )}
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                            d.discrepancyType === 'SHORT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {d.discrepancyType}
                          </span>
                          <span className={`text-xs font-bold ${d.discrepancyType === 'SHORT' ? 'text-red-700' : 'text-amber-700'}`}>
                            {fmtAmt(d.discrepancyAmount)}
                          </span>
                        </div>
                        {d.discrepancyReason && (
                          <p className="text-xs text-slate-400 mt-0.5 italic truncate">{d.discrepancyReason}</p>
                        )}
                      </div>

                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => toggleDeduct(d.id)}
                        className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                          isDeduct
                            ? 'bg-red-600 border-red-600 text-white'
                            : 'border-slate-300 text-slate-600 hover:border-red-400 hover:text-red-600'
                        }`}
                      >
                        {isDeduct ? 'Deduct ✓' : 'Skip'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {deductSet.size > 0 && (
                <div className="mt-2 flex items-center justify-between px-1">
                  <span className="text-xs text-slate-500">{deductSet.size} deduction{deductSet.size !== 1 ? 's' : ''} selected</span>
                  <span className="text-xs font-semibold text-red-700">−{fmtAmt(totalDeductAmt)} from net pay</span>
                </div>
              )}
              {deductSet.size === 0 && (
                <p className="text-xs text-slate-400 mt-1 px-1">All discrepancies set to Skip — they will remain pending for the next payroll run.</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-1 text-xs text-emerald-700">
              <span className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-[10px] font-bold shrink-0">✓</span>
              No pending discrepancies for this staff member.
            </div>
          )}
        </div>

        <div className="ui-modal-footer">
          <button onClick={onClose} className="ui-btn ui-btn-secondary">Back</button>
          <button
            onClick={() => onGenerate(Array.from(deductSet))}
            disabled={isPending}
            className="ui-btn ui-btn-primary"
          >
            {isPending
              ? <span className="flex items-center gap-1.5"><Spinner />Generating…</span>
              : 'Generate Payroll'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Collapsible group header ──────────────────────────────────────────────────
interface GroupProps {
  status: PayrollStatus
  /** Current page's records (already sliced). */
  records: PayrollRecord[]
  /** Total count for this status across all pages — shown in header. */
  totalRecords: number
  /** Gross total across ALL records for this status — shown in header. */
  totalAmount: number
  page: number
  pageSize: number
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  isOpen: boolean
  onToggle: () => void
  staff: any[]
  onStatusChange: (recordId: number, status: PayrollStatus) => void
  onDelete: (recordId: number) => void
  isPending: boolean
  isDeletePending: boolean
}

function PayrollGroup({
  status, records, totalRecords, totalAmount,
  page, pageSize, onPageChange, onPageSizeChange,
  isOpen, onToggle, staff, onStatusChange, onDelete, isPending, isDeletePending,
}: GroupProps) {
  const next = NEXT_STATUS[status]
  const [rejectRecordId, setRejectRecordId] = useState<number | null>(null)

  const totalPages   = Math.max(1, Math.ceil(totalRecords / pageSize))
  const pagedData = {
    content:       records,
    page,
    pageSize,
    totalElements: totalRecords,
    totalPages,
    hasNext:       page < totalPages - 1,
    hasPrevious:   page > 0,
  }

  return (
    <div className="ui-card p-0 overflow-hidden">
      {/* Group header — click to toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="ui-accordion-trigger"
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
            {status}
          </span>
          <span className="text-sm text-slate-500">
            {totalRecords} record{totalRecords !== 1 ? 's' : ''}
          </span>
          <span className="text-sm font-semibold text-slate-700">{fmtAmt(totalAmount)}</span>
        </div>
        <ChevronDown size={14} strokeWidth={2} className={`ui-accordion-arrow ${isOpen ? 'ui-accordion-arrow--open' : ''}`} />
      </button>

      {/* Records — shown only when expanded */}
      {isOpen && (
        <div className="ui-accordion-content border-t border-slate-100">
        <div className="divide-y divide-slate-100">
          {records.map(r => {
            const staffMember = staff.find((s: any) => s.id === r.userId)
            return (
              <div key={r.id} className="px-5 py-4 space-y-2.5 bg-white">
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-700">
                      {staffMember?.fullName ?? `Staff #${r.userId}`}
                    </span>
                    <span className="text-xs text-slate-400">
                      {fmtDate(r.periodFrom)} – {fmtDate(r.periodTo)}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-base font-bold text-slate-800">{fmtAmt(r.netPay)}</div>
                    {r.deductions > 0 && (
                      <div className="text-xs text-slate-400 line-through">{fmtAmt(r.grossAmount)}</div>
                    )}
                  </div>
                </div>

                {/* Breakdown */}
                <div className="bg-slate-50 rounded-lg border border-slate-100 divide-y divide-slate-100 text-xs">
                  {r.salaryType === 'DAILY' ? (
                    <>
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                          <span className="text-slate-500">Total days in period</span>
                        </div>
                        <span className="font-medium text-slate-700">{r.totalDays ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                          <span className="text-slate-500">Leave days deducted</span>
                        </div>
                        <span className="font-medium text-amber-700">− {r.leaveDays ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-slate-500">Days worked</span>
                          {r.dailyRateSnapshot != null && (
                            <span className="text-slate-400">@ {fmtAmt(r.dailyRateSnapshot)}/day</span>
                          )}
                        </div>
                        <span className="font-medium text-slate-700">{r.daysWorked ?? 0} days</span>
                      </div>
                    </>
                  ) : (
                    <>
                      {r.shift1Shifts > 0 && (
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                            <span className="text-slate-500">Night (12AM–8AM)</span>
                            <span className="text-slate-400">{r.shift1Shifts} shift{r.shift1Shifts !== 1 ? 's' : ''} · {r.shift1Hours.toFixed(2)} hrs</span>
                            {r.shift1RateSnapshot != null && (
                              <span className="text-slate-400">@ {fmtAmt(r.shift1RateSnapshot)}/hr</span>
                            )}
                          </div>
                          <span className="font-medium text-slate-700">
                            {r.shift1RateSnapshot != null ? fmtAmt(r.shift1Hours * r.shift1RateSnapshot) : '—'}
                          </span>
                        </div>
                      )}
                      {r.standardShifts > 0 && (
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                            <span className="text-slate-500">Day (8AM–12AM)</span>
                            <span className="text-slate-400">{r.standardShifts} shift{r.standardShifts !== 1 ? 's' : ''} · {r.standardHours.toFixed(2)} hrs</span>
                            {r.standardRateSnapshot != null && (
                              <span className="text-slate-400">@ {fmtAmt(r.standardRateSnapshot)}/hr</span>
                            )}
                          </div>
                          <span className="font-medium text-slate-700">
                            {r.standardRateSnapshot != null ? fmtAmt(r.standardHours * r.standardRateSnapshot) : '—'}
                          </span>
                        </div>
                      )}
                      {r.shift1Shifts === 0 && r.standardShifts === 0 && (
                        <p className="px-3 py-2 text-slate-400">No closed shifts in this period.</p>
                      )}
                    </>
                  )}
                  {r.deductions > 0 && (
                    <div className="flex items-center justify-between px-3 py-2 bg-red-50/60">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                        <span className="text-slate-500">Salary deductions</span>
                        <span className="text-xs text-slate-400">(discrepancy shortfall)</span>
                      </div>
                      <span className="font-medium text-red-600">− {fmtAmt(r.deductions)}</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">
                    {r.salaryType === 'DAILY'
                      ? `${r.daysWorked ?? 0} day${r.daysWorked !== 1 ? 's' : ''} worked`
                      : `${r.totalShifts} shift${r.totalShifts !== 1 ? 's' : ''} total`}
                    {r.notes && ` · ${r.notes}`}
                  </p>
                  <div className="flex items-center gap-2">
                    {status === 'DRAFT' && rejectRecordId === r.id ? (
                      <>
                        <button
                          onClick={() => setRejectRecordId(null)}
                          className="ui-btn ui-btn-secondary min-h-0 px-3 py-1 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => onDelete(r.id)}
                          disabled={isDeletePending}
                          className="ui-btn ui-btn-danger min-h-0 px-3 py-1 text-xs"
                        >
                          {isDeletePending ? 'Deleting…' : 'Delete'}
                        </button>
                      </>
                    ) : (
                      <>
                        {next && (
                          <button
                            onClick={() => onStatusChange(r.id, next)}
                            disabled={isPending}
                            className="ui-btn ui-btn-primary min-h-0 px-3 py-1 text-xs"
                          >
                            Mark {next}
                          </button>
                        )}
                        {status === 'DRAFT' && (
                          <button
                            onClick={() => setRejectRecordId(r.id)}
                            className="ui-btn ui-btn-secondary min-h-0 px-3 py-1 text-xs"
                          >
                            Reject
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <Pagination
          data={pagedData}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          pageSizeOptions={[10, 20, 50]}
        />
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const { addToast } = useToastStore()
  const qc = useQueryClient()

  const { selectedPumpId: pumpId } = usePumpStore()

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pumpId],
    queryFn:  () => userApi.getStaff(pumpId!),
    enabled:  !!pumpId,
  })

  const { data: records = [], isLoading, error: recordsError } = useQuery({
    queryKey: ['payroll', pumpId],
    queryFn:  () => payrollApi.getPayroll(pumpId!),
    enabled:  !!pumpId,
  })

  const [form, setForm] = useState<GeneratePayrollRequest>(() => ({
    userId: 0,
    periodFrom: yesterdayIso(),
    periodTo: todayIso(),
    notes: null,
  }))
  const [formError, setFormError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  // ── Filters ────────────────────────────────────────────────────────────────
  // Derive sorted list of unique month keys ("2026-04") from all records
  const monthOptions = useMemo(() => {
    const keys = new Set(records.map(r => toMonthKey(r.periodFrom)))
    return Array.from(keys).sort().reverse()   // newest first
  }, [records])

  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [nameSearch,    setNameSearch]    = useState('')

  // ── Per-status pagination (independent, default page size = 10) ──────────
  const [draftPage,        setDraftPage]        = useState(0)
  const [draftPageSize,    setDraftPageSize]    = useState(10)
  const [approvedPage,     setApprovedPage]     = useState(0)
  const [approvedPageSize, setApprovedPageSize] = useState(10)
  const [paidPage,         setPaidPage]         = useState(0)
  const [paidPageSize,     setPaidPageSize]     = useState(10)

  // ── Accordion: track which status group is open ────────────────────────────
  const [openGroup, setOpenGroup] = useState<PayrollStatus | null>('DRAFT')

  function toggleGroup(status: PayrollStatus) {
    setOpenGroup(prev => (prev === status ? null : status))
  }

  // ── Filtered + grouped records ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = records
    if (selectedMonth) result = result.filter(r => toMonthKey(r.periodFrom) === selectedMonth)
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase()
      result = result.filter(r => {
        const name = ((staff as any[]).find(s => s.id === r.userId)?.fullName ?? '').toLowerCase()
        return name.includes(q)
      })
    }
    return result
  }, [records, selectedMonth, nameSearch, staff])

  const grouped = useMemo(() => {
    const map: Record<PayrollStatus, PayrollRecord[]> = { DRAFT: [], APPROVED: [], PAID: [] }
    filtered.forEach(r => map[r.status].push(r))
    return map
  }, [filtered])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const generateMutation = useMutation({
    mutationFn: (data: GeneratePayrollRequest) => payrollApi.generatePayroll(pumpId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      setForm({ userId: 0, periodFrom: yesterdayIso(), periodTo: todayIso(), notes: null })
      setFormError(null)
      setReviewOpen(false)
      setOpenGroup('DRAFT')
      addToast('Payroll draft generated', 'success')
    },
    onError: (err: any) => {
      const msg = parseApiError(err, 'Failed to generate payroll')
      setFormError(msg)
      addToast(msg, 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (recordId: number) => payrollApi.deletePayroll(pumpId!, recordId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      addToast('Payroll record deleted', 'success')
    },
    onError: (err: any) => addToast(parseApiError(err, 'Failed to delete payroll'), 'error'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ recordId, status }: { recordId: number; status: PayrollStatus }) =>
      payrollApi.updateStatus(pumpId!, recordId, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['payroll', pumpId] })
      addToast(`Status updated to ${status}`, 'success')
    },
    onError: (err: any) => addToast(parseApiError(err, 'Failed to update status'), 'error'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.userId) { setFormError('Please select a staff member'); return }
    if (!form.periodFrom || !form.periodTo) { setFormError('Period dates are required'); return }
    setFormError(null)
    setReviewOpen(true)
  }

  const selectedStaff = staff.find((s: any) => s.id === form.userId)

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Header ── */}
      <Reveal delay={60}>
      <div className="ui-page-header">
        <div>
        <h1 className="ui-title-sm">Payroll</h1>
        <p className="ui-subtitle">Calculate and track staff salary payments based on shift history</p>
        </div>
      </div>
      </Reveal>

      {recordsError && (
        <div className="ui-alert ui-alert-warning text-sm">
          Could not load payroll records. Check your connection and refresh.
        </div>
      )}

      {/* ── Generate form ── */}
      <Reveal delay={130}>
      <form onSubmit={handleSubmit} className="ui-card ui-form-shell">
        <div className="ui-form-shell__head">
          <div>
            <p className="ui-section-kicker mb-2">Payroll Draft</p>
            <h2 className="ui-title-sm">Generate payroll</h2>
            <p className="ui-subtitle mt-1">Select a staff member and pay period to calculate a draft salary record.</p>
          </div>
        </div>

        <div className="ui-form-shell__grid">
          <div>
            <label className="ui-label">Staff Member</label>
            <SearchableSelect
              value={form.userId ? form.userId.toString() : ''}
              onChange={v => setForm(f => ({ ...f, userId: parseInt(v) || 0 }))}
              placeholder="Select staff…"
              options={staff.map((s: any) => ({ value: s.id.toString(), label: `${s.fullName} — ${s.role}` }))}
            />
          </div>

          <div>
            <label className="ui-label">Period From</label>
            <input
              type="date"
              value={form.periodFrom}
              onChange={e => setForm(f => ({ ...f, periodFrom: e.target.value }))}
              className="text-sm"
              required
            />
          </div>

          <div>
            <label className="ui-label">Period To</label>
            <input
              type="date"
              value={form.periodTo}
              onChange={e => setForm(f => ({ ...f, periodTo: e.target.value }))}
              className="text-sm"
              required
            />
          </div>

          <div>
            <label className="ui-label">Notes (optional)</label>
            <input
              type="text"
              value={form.notes ?? ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
              className="text-sm"
              placeholder="Any notes about this pay period"
            />
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Operators: actual hours per closed shift × hourly rate (night/day separately).
          Managers &amp; Admins: daily rate × (days in period − leave days).
          Configure rates in Setup → Staff → ₹ Rates.
        </p>

        {formError && <p className="ui-error-text">{formError}</p>}

        <button
          type="submit"
          disabled={generateMutation.isPending}
          className="ui-btn ui-btn-primary"
        >
          {generateMutation.isPending
            ? <span className="flex items-center gap-1.5"><Spinner />Calculating…</span>
            : 'Review Payroll'}
        </button>
      </form>
      </Reveal>

      {reviewOpen && form.userId > 0 && (
        <ReviewModal
          form={form}
          selectedStaff={selectedStaff}
          pumpId={pumpId!}
          formError={formError}
          isPending={generateMutation.isPending}
          onClose={() => setReviewOpen(false)}
          onGenerate={(deductIds) => generateMutation.mutate({ ...form, deductFromSalaryShiftIds: deductIds })}
        />
      )}

      {/* ── Payroll records ── */}
      <Reveal delay={210}>
      <div className="space-y-3">
        {/* Section header + month filter */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">
            Payroll Records
            {filtered.length > 0 && (
              <span className="ml-1.5 text-slate-400 font-normal">({filtered.length})</span>
            )}
          </p>

          <div className="flex items-center gap-3">
            <input
              type="search"
              value={nameSearch}
              onChange={e => { setNameSearch(e.target.value); setDraftPage(0); setApprovedPage(0); setPaidPage(0) }}
              placeholder="Search staff…"
              className="text-sm h-8 px-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300 w-36"
            />
            {monthOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500">Month</label>
                <select
                  value={selectedMonth}
                  onChange={e => {
                    setSelectedMonth(e.target.value)
                    setDraftPage(0); setApprovedPage(0); setPaidPage(0)
                  }}
                  className="text-sm bg-white"
                >
                  <option value="">All months</option>
                  {monthOptions.map(key => (
                    <option key={key} value={key}>{fmtMonthKey(key)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="ui-card px-5 py-4">
            <SkeletonTable rows={4} cols={3} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="ui-card">
            <EmptyState
              icon="payroll"
              title={records.length === 0 ? 'No payroll records yet' : 'No records for this month'}
              subtitle={records.length === 0 ? 'Generate your first payroll draft above.' : 'Try selecting a different month.'}
            />
          </div>
        ) : (
          /* One collapsible group per status — only renders groups that have records */
          <div className="space-y-2">
            {STATUS_ORDER.filter(s => grouped[s].length > 0).map(status => {
              const allForStatus = grouped[status]
              const totalRecords = allForStatus.length
              const totalAmount  = allForStatus.reduce((s, r) => s + r.grossAmount, 0)

              const pageState = {
                DRAFT:    { page: draftPage,    pageSize: draftPageSize,
                            setPage: setDraftPage,    setPageSize: setDraftPageSize },
                APPROVED: { page: approvedPage, pageSize: approvedPageSize,
                            setPage: setApprovedPage, setPageSize: setApprovedPageSize },
                PAID:     { page: paidPage,     pageSize: paidPageSize,
                            setPage: setPaidPage,     setPageSize: setPaidPageSize },
              }[status]

              const totalPages = Math.max(1, Math.ceil(totalRecords / pageState.pageSize))
              const safePage   = Math.min(pageState.page, totalPages - 1)
              const pagedRecords = allForStatus.slice(
                safePage * pageState.pageSize,
                (safePage + 1) * pageState.pageSize,
              )

              return (
                <PayrollGroup
                  key={status}
                  status={status}
                  records={pagedRecords}
                  totalRecords={totalRecords}
                  totalAmount={totalAmount}
                  page={safePage}
                  pageSize={pageState.pageSize}
                  onPageChange={pageState.setPage}
                  onPageSizeChange={s => { pageState.setPageSize(s); pageState.setPage(0) }}
                  isOpen={openGroup === status}
                  onToggle={() => toggleGroup(status)}
                  staff={staff}
                  onStatusChange={(recordId, next) => statusMutation.mutate({ recordId, status: next })}
                  onDelete={(recordId) => deleteMutation.mutate(recordId)}
                  isPending={statusMutation.isPending}
                  isDeletePending={deleteMutation.isPending}
                />
              )
            })}
          </div>
        )}
      </div>
      </Reveal>
    </div>
  )
}
