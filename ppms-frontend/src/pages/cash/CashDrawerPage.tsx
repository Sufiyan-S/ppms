import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePumpStore } from '../../store/usePumpStore'
import { cashApi } from '../../api/cashApi'
import type { CashEventType, RecordCashEventRequest } from '../../api/cashApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { formatIstDate, localDateInputValue } from '../../utils/date'
import { SkeletonRows } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'

const EVENT_TYPES: { value: CashEventType; label: string }[] = [
  { value: 'OPENING_BALANCE', label: 'Opening Balance' },
  { value: 'CASH_IN',         label: 'Cash In' },
  { value: 'CASH_OUT',        label: 'Cash Out' },
  { value: 'CLOSING_BALANCE', label: 'Closing Balance' },
]

const EVENT_STYLES: Record<CashEventType, string> = {
  OPENING_BALANCE: 'bg-blue-100 text-blue-700',
  CASH_IN:         'bg-emerald-100 text-emerald-700',
  CASH_OUT:        'bg-red-100 text-red-700',
  CLOSING_BALANCE: 'bg-slate-100 text-slate-700',
}

function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return formatIstDate(d)
}

export default function CashDrawerPage() {
  const qc = useQueryClient()

  const { selectedPumpId: pumpId } = usePumpStore()

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [eventTypeFilter, setEventTypeFilter] = useState<CashEventType | ''>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  const { data: cashData, isLoading, error: cashError } = useQuery({
    queryKey:  ['cashEvents', pumpId, page, pageSize, eventTypeFilter],
    queryFn:   () => cashApi.getCashEvents(pumpId!, page, pageSize, eventTypeFilter || undefined),
    enabled:   !!pumpId,
  })

  const [form, setForm] = useState<RecordCashEventRequest>({
    eventType: 'CASH_IN',
    amount: 0,
    description: '',
    eventDate: localDateInputValue(),
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  const { addToast } = useToastStore()

  const createMutation = useMutation({
    mutationFn: (data: RecordCashEventRequest) => cashApi.recordCashEvent(pumpId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashEvents', pumpId] })
      setForm({ eventType: 'CASH_IN', amount: 0, description: '', eventDate: localDateInputValue() })
      setFormError(null)
      setReviewOpen(false)
      addToast('Cash event recorded successfully', 'success')
    },
    onError: (err: any) => {
      const msg = parseApiError(err, 'Failed to record event')
      setFormError(msg)
      addToast(msg, 'error')
    },
  })

  const validateForm = () => {
    if (!form.description.trim()) {
      setFormError('Description is required')
      return false
    }
    if (form.amount <= 0) {
      setFormError('Amount must be greater than zero')
      return false
    }
    if (form.eventType === 'CASH_OUT' && form.amount > balance) {
      setFormError(`Cash-out amount ${fmtAmt(form.amount)} exceeds the current drawer balance of ${fmtAmt(balance)}.`)
      return false
    }
    setFormError(null)
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return
    setReviewOpen(true)
  }

  const balance = cashData?.currentBalance ?? 0
  const reviewHeaderTone =
    form.eventType === 'CASH_OUT'
      ? 'ui-modal-header--danger'
      : form.eventType === 'CASH_IN'
        ? 'ui-modal-header--success'
        : form.eventType === 'OPENING_BALANCE'
          ? 'ui-modal-header--info'
          : 'ui-modal-header--neutral'

  const allEvents = cashData?.events?.content ?? []
  const filteredEvents = useMemo(() => {
    return allEvents.filter(ev => {
      if (fromDate && ev.eventDate < fromDate) return false
      if (toDate   && ev.eventDate > toDate)   return false
      return true
    })
  }, [allEvents, fromDate, toDate])

  return (
    <div className="ui-page ui-page--narrow space-y-5">

      {/* ── Header ── */}
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Cash flow</p>
          <h1 className="ui-title-sm">Cash Drawer</h1>
          <p className="ui-subtitle">Track cash movements in and out of the pump safe</p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Balance</span>
            <span className="ui-section-meta-value">{fmtAmt(balance)}</span>
          </div>
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Events</span>
            <span className="ui-section-meta-value">{cashData?.events?.totalElements ?? 0}</span>
          </div>
        </div>
      </div>
      </Reveal>

      {cashError && (
        <div className="ui-alert ui-alert-warning text-sm">
          Could not load cash events. Check your connection and refresh.
        </div>
      )}

      {/* ── Balance card ── */}
      <Reveal delay={130}>
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-3xl px-6 py-5 text-white shadow-[0_22px_42px_rgba(5,150,105,0.22)]">
        <p className="text-emerald-200 text-sm">Current Balance</p>
        <p className="text-3xl font-bold mt-1">{fmtAmt(balance)}</p>
        <p className="text-emerald-200 text-xs mt-1">Calculated from all cash-in minus cash-out events</p>
      </div>
      </Reveal>

      {/* ── Add event form ── */}
      <Reveal delay={200}>
      <form onSubmit={handleSubmit} className="ui-card ui-form-shell">
        <div className="ui-form-shell__head">
          <div>
            <p className="ui-section-kicker mb-2">Cash Entry</p>
            <h2 className="ui-title-sm">Record cash movement</h2>
            <p className="ui-subtitle mt-1">Log money entering or leaving the safe with the right event type and date.</p>
          </div>
        </div>

        <div className="ui-form-shell__grid">
          <div>
            <label className="ui-label">Event Type</label>
            <SearchableSelect
              value={form.eventType}
              onChange={v => setForm(f => ({ ...f, eventType: v as CashEventType }))}
              options={EVENT_TYPES.map(t => ({ value: t.value, label: t.label }))}
            />
          </div>

          <div>
            <label className="ui-label">Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount || ''}
              onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              className={`text-sm ${form.eventType === 'CASH_OUT' && form.amount > balance ? 'border-red-400 focus:ring-red-300' : ''}`}
              placeholder="0.00"
              required
              autoFocus
            />
            {form.eventType === 'CASH_OUT' && (
              <p className={`mt-1 text-xs ${form.amount > balance ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                Available balance: {fmtAmt(balance)}
              </p>
            )}
          </div>

          <div>
            <label className="ui-label">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="text-sm"
              placeholder="e.g. Shift 1 cash deposited"
              required
            />
          </div>

          <div>
            <label className="ui-label">Date</label>
            <input
              type="date"
              value={form.eventDate}
              onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))}
              className="text-sm"
              required
            />
          </div>
        </div>

        {formError && <p className="ui-error-text">{formError}</p>}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="ui-btn ui-btn-primary"
        >
          {createMutation.isPending
          ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Saving…</span>
          : 'Review Event'}
        </button>
      </form>
      </Reveal>

      {reviewOpen && (
        <ModalPortal>
        <div className="ui-modal-backdrop" onClick={() => setReviewOpen(false)}>
          <div className="ui-modal-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className={`ui-modal-header ui-modal-header--themed ${reviewHeaderTone}`}>
              <div className="ui-modal-heading">
                <h2 className="ui-modal-title">Review Cash Event</h2>
                <p className="ui-modal-subtitle">Check the event details before recording it.</p>
              </div>
              <button onClick={() => setReviewOpen(false)} className="ui-btn ui-btn-ghost ui-modal-close">&times;</button>
            </div>
            <div className="ui-modal-body space-y-4">
              {formError && <div className="ui-alert ui-alert-danger text-sm">{formError} Go back to modify the data and try again.</div>}
              <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 text-xs">Event Type</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${EVENT_STYLES[form.eventType]}`}>
                    {EVENT_TYPES.find((eventType) => eventType.value === form.eventType)?.label ?? form.eventType}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 text-xs">Amount</span>
                  <span className="font-medium text-sm text-slate-800">{fmtAmt(form.amount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-slate-500 text-xs">Description</span>
                  <span className="font-medium text-right text-sm text-slate-800">{form.description.trim()}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 text-xs">Date</span>
                  <span className="font-medium text-sm text-slate-800">{fmtDate(form.eventDate)}</span>
                </div>
              </div>
            </div>
            <div className="ui-modal-footer">
              <button onClick={() => setReviewOpen(false)} className="ui-btn ui-btn-secondary">
                Back
              </button>
              <button
                onClick={() => {
                  if (!validateForm()) {
                    return
                  }
                  createMutation.mutate(form)
                }}
                disabled={createMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {createMutation.isPending ? 'Saving…' : 'Record Event'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Event list ── */}
      <Reveal delay={270}>
      <div className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <p className="ui-toolbar-title">Cash Events</p>
          <div className="ui-toolbar-actions">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 whitespace-nowrap">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={e => { setFromDate(e.target.value); setPage(0) }}
                className="text-xs h-7 px-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 whitespace-nowrap">To</label>
              <input
                type="date"
                value={toDate}
                onChange={e => { setToDate(e.target.value); setPage(0) }}
                className="text-xs h-7 px-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="w-44">
            <SearchableSelect
              value={eventTypeFilter}
              onChange={v => { setEventTypeFilter(v as any); setPage(0) }}
              options={[
                { value: '', label: 'All Types' },
                ...EVENT_TYPES.map(t => ({ value: t.value, label: t.label })),
              ]}
              size="sm"
            />
          </div>
          </div>
        </div>

        {isLoading ? (
          <div className="px-5 py-4"><SkeletonRows count={4} /></div>
        ) : filteredEvents.length === 0 ? (
          <EmptyState
            icon="transactions"
            title={fromDate || toDate ? 'No events in this date range' : 'No cash events recorded yet'}
            subtitle={fromDate || toDate ? 'Try adjusting the date filters above.' : 'Use the form above to record your first cash movement.'}
          />
        ) : (
          <>
            <div className="ui-record-list">
              {filteredEvents.map(ev => (
                <div key={ev.id} className="ui-record-row">
                  <div className="flex items-center gap-3 min-w-0 ui-record-row__main">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${EVENT_STYLES[ev.eventType]}`}>
                      {ev.eventType.replace('_', ' ')}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{ev.description}</p>
                      <div className="ui-record-row__meta mt-0">
                        <span>{fmtDate(ev.eventDate)}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold flex-shrink-0 ${
                    ev.eventType === 'CASH_OUT' ? 'text-red-600' : 'text-emerald-600'
                  }`}>
                    {ev.eventType === 'CASH_OUT' ? '−' : '+'}{fmtAmt(ev.amount)}
                  </span>
                </div>
              ))}
            </div>
            {cashData?.events && (
              <div className="px-5">
                <Pagination
                  data={cashData.events}
                  onPageChange={p => setPage(p)}
                  onPageSizeChange={s => { setPageSize(s); setPage(0) }}
                  pageSizeOptions={[10, 20, 50]}
                />
              </div>
            )}
          </>
        )}
      </div>
      </Reveal>
    </div>
  )
}
