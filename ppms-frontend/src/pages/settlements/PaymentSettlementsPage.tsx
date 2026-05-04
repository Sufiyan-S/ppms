import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Smartphone, CreditCard, Truck, Landmark, Clock, CheckCircle2, Check, ArrowRight, AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { SettlementPaymentType, RecordSettlementRequest, UpdateConfigRequest } from '../../api/paymentSettlementApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { canPerformAction } from '../../permissions/permissions'
import { localDateInputValue } from '../../utils/date'

// ── Constants ──────────────────────────────────────────────────────────────

const TYPES: SettlementPaymentType[] = ['UPI', 'CARD', 'FLEET_CARD']

const TYPE_LABELS: Record<SettlementPaymentType, string> = {
  UPI:        'UPI',
  CARD:       'Card',
  FLEET_CARD: 'Fleet Card',
}

const TYPE_ICONS: Record<SettlementPaymentType, ReactNode> = {
  UPI:        <Smartphone size={16} strokeWidth={2} />,
  CARD:       <CreditCard size={16} strokeWidth={2} />,
  FLEET_CARD: <Truck size={16} strokeWidth={2} />,
}

const TYPE_ACCENT: Record<SettlementPaymentType, { icon: string; badge: string; pill: string; pillActive: string }> = {
  UPI:        { icon: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700', pill: 'border-violet-200 text-violet-700 hover:bg-violet-50', pillActive: 'bg-violet-600 text-white border-violet-600' },
  CARD:       { icon: 'bg-blue-500',   badge: 'bg-blue-100 text-blue-700',     pill: 'border-blue-200 text-blue-700 hover:bg-blue-50',     pillActive: 'bg-blue-600 text-white border-blue-600'   },
  FLEET_CARD: { icon: 'bg-teal-500',   badge: 'bg-teal-100 text-teal-700',     pill: 'border-teal-200 text-teal-700 hover:bg-teal-50',     pillActive: 'bg-teal-600 text-white border-teal-600'   },
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtAmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getPending(wallet: { upiPending: number; cardPending: number; fleetCardPending: number } | undefined, type: SettlementPaymentType): number {
  if (!wallet) return 0
  return type === 'UPI' ? wallet.upiPending : type === 'CARD' ? wallet.cardPending : wallet.fleetCardPending
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PaymentSettlementsPage() {
  const { user }                   = useAuthStore()
  const { selectedPumpId: pumpId } = usePumpStore()
  const qc                         = useQueryClient()
  const { addToast }               = useToastStore()

  const canWrite     = canPerformAction('settlement:write', user?.role)
  const canConfigure = canPerformAction('settlement:configure', user?.role)

  const [activeTab, setActiveTab]   = useState<'records' | 'config'>('records')
  const [typeFilter, setTypeFilter] = useState<SettlementPaymentType | ''>('')

  // Date range filter for the history — defaults to last 7 days
  function localDateStr(offsetDays = 0): string {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const [filterFrom, setFilterFrom] = useState(() => localDateStr(-7))
  const [filterTo, setFilterTo]     = useState(() => localDateStr(0))
  const [summaryPage, setSummaryPage]         = useState(0)
  const [summaryPageSize, setSummaryPageSize] = useState(10)

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: dailySummaryPage, isLoading: loadingList, isFetching: fetchingList, dataUpdatedAt: listUpdatedAt } = useQuery({
    queryKey: ['settlements-daily', pumpId, filterFrom, filterTo, summaryPage, summaryPageSize],
    queryFn:  () => paymentSettlementApi.getDailySummary(pumpId!, filterFrom, filterTo, summaryPage, summaryPageSize),
    enabled:  !!pumpId && !!filterFrom && !!filterTo,
  })
  const dailySummary = dailySummaryPage?.content ?? []
  const { data: wallet, isLoading: loadingWallet } = useQuery({
    queryKey: ['settlements-wallet', pumpId],
    queryFn:  () => paymentSettlementApi.getWallet(pumpId!),
    enabled:  !!pumpId,
  })
  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['settlement-configs', pumpId],
    queryFn:  () => paymentSettlementApi.getConfigs(pumpId!),
    enabled:  !!pumpId,
  })

  // ── Record settlement dialog ──────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [form, setForm]             = useState<RecordSettlementRequest>({
    paymentType:    'UPI',
    settlementDate: localDateInputValue(),
    amountReceived: 0,
    notes:          '',
  })

  const openDialog = (type?: SettlementPaymentType) => {
    setForm({ paymentType: type ?? 'UPI', settlementDate: localDateInputValue(), amountReceived: 0, notes: '' })
    setFormError(null)
    setDialogOpen(true)
  }

  const recordMutation = useMutation({
    mutationFn: (data: RecordSettlementRequest) => paymentSettlementApi.record(pumpId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlements-daily', pumpId] })
      qc.invalidateQueries({ queryKey: ['settlements-wallet', pumpId] })
      setDialogOpen(false)
      addToast('Settlement recorded successfully', 'success')
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Failed to record settlement'
      setFormError(msg)
    },
  })

  const handleRecord = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    if (!form.settlementDate) { setFormError('Settlement date is required'); return }
    if (form.amountReceived <= 0) { setFormError('Amount must be greater than zero'); return }
    recordMutation.mutate({ ...form, notes: form.notes || undefined })
  }

  // ── Config update ─────────────────────────────────────────────────────────
  const [configEdits, setConfigEdits]   = useState<Record<string, UpdateConfigRequest>>({})
  const [savingConfig, setSavingConfig] = useState<string | null>(null)

  const handleConfigChange = (type: SettlementPaymentType, field: keyof UpdateConfigRequest, value: any) => {
    setConfigEdits(prev => ({
      ...prev,
      [type]: { ...(prev[type] ?? { alertTime: '18:00', enabled: true }), [field]: value },
    }))
  }

  const saveConfig = async (type: SettlementPaymentType) => {
    const current = configs.find(c => c.paymentType === type)
    const edit    = configEdits[type]
    if (!edit) return
    setSavingConfig(type)
    try {
      await paymentSettlementApi.upsertConfig(pumpId!, type, {
        alertTime: edit.alertTime ?? current?.alertTime ?? '18:00',
        enabled:   edit.enabled  ?? current?.enabled   ?? true,
      })
      qc.invalidateQueries({ queryKey: ['settlement-configs', pumpId] })
      setConfigEdits(prev => { const next = { ...prev }; delete next[type]; return next })
      addToast(`${TYPE_LABELS[type]} alert config saved`, 'success')
    } catch (err: any) {
      addToast(err?.response?.data?.message ?? 'Failed to save config', 'error')
    } finally {
      setSavingConfig(null)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const pendingAfterRecord = wallet
    ? Math.max(0, getPending(wallet, form.paymentType) - form.amountReceived)
    : null

  if (!pumpId) return <EmptyState icon="generic" title="Select a pump to view settlement records." />

  return (
    <Reveal>
      <div className="ui-page">

        {/* ── Header ── */}
        <div className="ui-page-header mb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="ui-title">Payment Settlements</h1>
              <RefreshIndicator isFetching={fetchingList} dataUpdatedAt={listUpdatedAt ?? 0} />
            </div>
            <p className="ui-subtitle">
              Track when UPI, Card &amp; Fleet Card payments arrive in your bank account.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => openDialog()}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-semibold text-sm text-white
                         bg-gradient-to-b from-emerald-500 to-emerald-600
                         shadow-[0_10px_20px_rgba(5,150,105,0.28)]
                         hover:from-emerald-600 hover:to-emerald-700 hover:shadow-[0_10px_20px_rgba(5,150,105,0.38)]
                         active:scale-[0.97] transition-all duration-150"
            >
              <Landmark size={16} strokeWidth={2} />
              Record Settlement
            </button>
          )}
        </div>

        {/* ── Wallet stat cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {loadingWallet
            ? TYPES.map(t => <div key={t} className="ui-dashboard-stat animate-pulse h-28" />)
            : TYPES.map(type => {
                const pending = getPending(wallet, type)
                const accent  = TYPE_ACCENT[type]
                const settled = pending <= 0
                return (
                  <div key={type} className="ui-dashboard-stat">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {TYPE_LABELS[type]}
                      </span>
                      <div className={`w-9 h-9 ${accent.icon} rounded-xl flex items-center justify-center text-white shadow-sm`}>
                        {TYPE_ICONS[type]}
                      </div>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums tracking-tight ${settled ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {fmtAmt(pending)}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs font-medium ${settled ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {settled
                          ? <span className="inline-flex items-center gap-1"><Check size={11} strokeWidth={2.5} />Fully settled</span>
                          : 'In transit'
                        }
                      </span>
                      {canWrite && !settled && (
                        <button
                          onClick={() => openDialog(type)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                        >
                          Record<ArrowRight size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* ── Total in-transit banner ── */}
        {wallet && (
          <div className={`rounded-xl border px-4 py-3 mb-6 flex items-center gap-3 ${
            wallet.totalPending > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}>
            <span className="leading-none">
              {wallet.totalPending > 0
                ? <Clock size={18} strokeWidth={2} className="text-amber-500" />
                : <CheckCircle2 size={18} strokeWidth={2} className="text-emerald-500" />
              }
            </span>
            <div className="flex-1">
              <span className={`text-sm font-medium ${wallet.totalPending > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                {wallet.totalPending > 0
                  ? 'Total amount still in transit — not yet credited to your bank account'
                  : 'All payments have been settled — no pending amounts'}
              </span>
            </div>
            <span className={`text-lg font-bold tabular-nums ${wallet.totalPending > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {fmtAmt(wallet.totalPending)}
            </span>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-0 mb-5 border-b border-slate-200">
          {(['records', 'config'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'records' ? 'Settlement History' : 'Alert Settings'}
            </button>
          ))}
        </div>

        {/* ── Records tab ── */}
        {activeTab === 'records' && (
          <div className="ui-card p-0 overflow-hidden">
            {/* Toolbar: date range + type filter */}
            <div className="ui-toolbar">
              <p className="ui-toolbar-title">Settlement History</p>
              <div className="ui-toolbar-actions">
                <input
                  type="date"
                  value={filterFrom}
                  max={filterTo}
                  onChange={e => { setFilterFrom(e.target.value); setSummaryPage(0) }}
                  style={{ width: '155px', minHeight: '36px' }}
                  className="text-sm"
                />
                <span className="text-slate-400 text-sm">–</span>
                <input
                  type="date"
                  value={filterTo}
                  min={filterFrom}
                  onChange={e => { setFilterTo(e.target.value); setSummaryPage(0) }}
                  style={{ width: '155px', minHeight: '36px' }}
                  className="text-sm"
                />
                <div style={{ width: '160px' }}>
                  <SearchableSelect
                    value={typeFilter}
                    onChange={v => setTypeFilter(v as SettlementPaymentType | '')}
                    options={[
                      { value: '',           label: 'All Types'  },
                      { value: 'UPI',        label: 'UPI'        },
                      { value: 'CARD',       label: 'Card'       },
                      { value: 'FLEET_CARD', label: 'Fleet Card' },
                    ]}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {loadingList ? (
              <div className="px-5 py-4"><SkeletonRows count={5} /></div>
            ) : dailySummary.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-1"><Landmark size={26} strokeWidth={1.5} className="text-slate-400" /></div>
                <p className="font-semibold text-slate-700">No activity in this date range</p>
                <p className="text-sm text-slate-400 max-w-sm">
                  No shift collections or settlements were found between the selected dates.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {dailySummary.map(entry => {
                  const visibleSettlements = typeFilter
                    ? entry.settlements.filter(s => s.paymentType === typeFilter)
                    : entry.settlements

                  const collectedByType = ([
                    { type: 'UPI',        collected: entry.upiCollected,        settled: entry.upiSettled        },
                    { type: 'CARD',       collected: entry.cardCollected,       settled: entry.cardSettled       },
                    { type: 'FLEET_CARD', collected: entry.fleetCardCollected,  settled: entry.fleetCardSettled  },
                  ] as { type: SettlementPaymentType; collected: number; settled: number }[]).filter(r => typeFilter ? r.type === typeFilter : r.collected > 0 || r.settled > 0)

                  if (collectedByType.length === 0 && visibleSettlements.length === 0) return null

                  return (
                    <div key={entry.date} className="px-5 py-4 space-y-3">
                      {/* Date header */}
                      <p className="text-sm font-bold text-slate-700">{fmtDate(entry.date)}</p>

                      {/* Collected vs Settled per type */}
                      {collectedByType.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {collectedByType.map(({ type, collected, settled }) => {
                            const accent   = TYPE_ACCENT[type]
                            const balance  = collected - settled
                            const balanced = balance <= 0
                            return (
                              <div key={type} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${accent.badge}`}>
                                    {TYPE_ICONS[type]} {TYPE_LABELS[type]}
                                  </span>
                                  {balanced
                                    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><Check size={11} strokeWidth={2.5} />Settled</span>
                                    : <span className="text-xs text-amber-600 font-medium">In transit</span>
                                  }
                                </div>
                                <div className="flex justify-between text-xs text-slate-500 mt-0.5">
                                  <span>Collected</span>
                                  <span className="font-semibold text-slate-700 tabular-nums">{fmtAmt(collected)}</span>
                                </div>
                                <div className="flex justify-between text-xs text-slate-500">
                                  <span>Settled</span>
                                  <span className="font-semibold text-emerald-700 tabular-nums">{fmtAmt(settled)}</span>
                                </div>
                                {!balanced && (
                                  <div className="flex justify-between text-xs border-t border-dashed border-slate-200 pt-1 mt-0.5">
                                    <span className="text-amber-600">Pending</span>
                                    <span className="font-bold text-amber-700 tabular-nums">{fmtAmt(balance)}</span>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Individual settlement records */}
                      {visibleSettlements.length > 0 && (
                        <div className="space-y-1.5 pl-1">
                          {visibleSettlements.map(s => {
                            const accent    = TYPE_ACCENT[s.paymentType]
                            const shortfall = s.isPartial && s.pendingAtRecordTime != null
                              ? s.pendingAtRecordTime - s.amountReceived
                              : 0
                            return (
                              <div key={s.id} className="flex items-start gap-3">
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${accent.badge}`}>
                                  {TYPE_ICONS[s.paymentType]} {TYPE_LABELS[s.paymentType]}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {s.isPartial && (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                        <AlertTriangle size={11} strokeWidth={2} />Partial · {fmtAmt(shortfall)} short
                                      </span>
                                    )}
                                    <span className="text-xs text-slate-500 truncate">
                                      {s.notes ? `${s.notes} · ` : ''}by {s.recordedByUserName}
                                    </span>
                                  </div>
                                  {s.isPartial && s.pendingAtRecordTime != null && (
                                    <p className="text-xs text-slate-400 mt-0.5">
                                      Expected {fmtAmt(s.pendingAtRecordTime)} · received {fmtAmt(s.amountReceived)}
                                    </p>
                                  )}
                                </div>
                                <span className="text-sm font-bold text-emerald-700 tabular-nums flex-shrink-0">+{fmtAmt(s.amountReceived)}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {dailySummaryPage && dailySummaryPage.totalElements > 0 && (
              <div className="px-5 border-t border-slate-100">
                <Pagination
                  data={dailySummaryPage}
                  onPageChange={p => setSummaryPage(p)}
                  onPageSizeChange={s => { setSummaryPageSize(s); setSummaryPage(0) }}
                  pageSizeOptions={[10, 20, 50]}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Alert settings tab ── */}
        {activeTab === 'config' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 mb-4">
              Set the time when you want to receive a daily reminder to record each payment type's settlement.
              Alerts arrive as in-app notifications — once per day, after the configured time.
            </p>
            {loadingConfigs ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm"><Spinner /> Loading…</div>
            ) : (
              configs.map(cfg => {
                const edit      = configEdits[cfg.paymentType]
                const alertTime = edit?.alertTime ?? cfg.alertTime
                const enabled   = edit?.enabled   ?? cfg.enabled
                const isDirty   = !!edit
                const accent    = TYPE_ACCENT[cfg.paymentType]

                return (
                  <div key={cfg.paymentType} className="ui-dashboard-module px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-9 h-9 ${accent.icon} rounded-xl flex items-center justify-center text-white text-base shadow-sm flex-shrink-0`}>
                        {TYPE_ICONS[cfg.paymentType]}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{TYPE_LABELS[cfg.paymentType]}</p>
                        <p className="text-xs text-slate-400">Daily reminder at this time (IST)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                      <input
                        type="time"
                        value={alertTime}
                        disabled={!canConfigure}
                        onChange={e => handleConfigChange(cfg.paymentType, 'alertTime', e.target.value)}
                        className="ui-input w-36 text-sm"
                      />
                      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={!canConfigure}
                          onChange={e => handleConfigChange(cfg.paymentType, 'enabled', e.target.checked)}
                          className="rounded accent-blue-600 w-4 h-4"
                        />
                        Enabled
                      </label>
                      {canConfigure && isDirty && (
                        <button
                          onClick={() => saveConfig(cfg.paymentType)}
                          disabled={savingConfig === cfg.paymentType}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white
                                     bg-gradient-to-b from-emerald-500 to-emerald-600
                                     shadow-[0_4px_10px_rgba(5,150,105,0.25)]
                                     hover:from-emerald-600 hover:to-emerald-700
                                     active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                                     transition-all duration-150"
                        >
                          {savingConfig === cfg.paymentType
                            ? <><Spinner /><span>Saving…</span></>
                            : <><Check size={14} strokeWidth={2.5} /><span>Save</span></>}
                        </button>
                      )}
                      {!isDirty && (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {enabled ? 'Active' : 'Disabled'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* ── Record settlement dialog ── */}
      {dialogOpen && (
        <ModalPortal>
          <div className="ui-modal-backdrop" onClick={() => setDialogOpen(false)}>
            <div className="ui-modal-panel" onClick={e => e.stopPropagation()}>

              {/* Themed header */}
              <div className="ui-modal-header ui-modal-header--themed ui-modal-header--success">
                <div className="ui-modal-heading">
                  <h2 className="ui-modal-title text-white">Record Settlement</h2>
                  <p className="ui-modal-subtitle">Enter the amount credited to your bank account</p>
                </div>
                <button className="ui-modal-close" onClick={() => setDialogOpen(false)}>×</button>
              </div>

              <form onSubmit={handleRecord} className="ui-modal-body flex flex-col gap-5">

                {/* Payment type pill selector */}
                <div>
                  <label className="ui-label mb-2">Payment Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TYPES.map(t => {
                      const accent  = TYPE_ACCENT[t]
                      const active  = form.paymentType === t
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, paymentType: t }))}
                          className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-semibold text-sm transition-all ${
                            active ? accent.pillActive : accent.pill + ' bg-white'
                          }`}
                        >
                          <span className="leading-none">{TYPE_ICONS[t]}</span>
                          <span>{TYPE_LABELS[t]}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Current pending context for selected type */}
                {wallet && (
                  <div className={`rounded-xl border px-4 py-3 ${
                    getPending(wallet, form.paymentType) > 0
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {TYPE_LABELS[form.paymentType]} — Current Pending
                      </span>
                      <span className={`text-base font-bold tabular-nums ${
                        getPending(wallet, form.paymentType) > 0 ? 'text-amber-700' : 'text-emerald-700'
                      }`}>
                        {fmtAmt(getPending(wallet, form.paymentType))}
                      </span>
                    </div>
                    {form.amountReceived > 0 && pendingAfterRecord !== null && (
                      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-dashed border-slate-200">
                        <span className="text-xs text-slate-500">After this settlement</span>
                        <span className={`text-sm font-bold tabular-nums ${pendingAfterRecord > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {fmtAmt(pendingAfterRecord)}
                          {pendingAfterRecord <= 0 && <span className="ml-1 inline-flex items-center gap-1 text-xs"><Check size={11} strokeWidth={2.5} />Fully settled</span>}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Date + Amount row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="ui-label">Settlement Date</label>
                    <p className="text-[11px] text-slate-400 mb-1.5 -mt-1">Date money arrived in bank</p>
                    <input
                      type="date"
                      className="ui-input"
                      value={form.settlementDate}
                      max={localDateInputValue()}
                      onChange={e => setForm(f => ({ ...f, settlementDate: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="ui-label">Amount Received (₹)</label>
                    <p className="text-[11px] text-slate-400 mb-1.5 -mt-1">Bank credit amount</p>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm pointer-events-none">₹</span>
                      <input
                        type="number"
                        className="ui-input pl-7"
                        min={0}
                        step={0.01}
                        placeholder="0.00"
                        value={form.amountReceived || ''}
                        onChange={e => setForm(f => ({ ...f, amountReceived: parseFloat(e.target.value) || 0 }))}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="ui-label">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    className="ui-input"
                    placeholder="e.g., Partial credit from yesterday's UPI batch"
                    value={form.notes ?? ''}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                {/* Error */}
                {formError && (
                  <div className="ui-alert ui-alert-danger text-sm py-2">
                    {formError}
                  </div>
                )}

                {/* Footer */}
                <div className="ui-modal-footer mt-2">
                  <button
                    type="button"
                    onClick={() => setDialogOpen(false)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm
                               text-slate-600 bg-slate-100 border border-slate-200
                               hover:bg-slate-200 hover:text-slate-800
                               active:scale-[0.97] transition-all duration-150"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={recordMutation.isPending}
                    className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-semibold text-sm text-white
                               bg-gradient-to-b from-emerald-500 to-emerald-600
                               shadow-[0_8px_16px_rgba(5,150,105,0.28)]
                               hover:from-emerald-600 hover:to-emerald-700 hover:shadow-[0_10px_20px_rgba(5,150,105,0.38)]
                               active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                               transition-all duration-150"
                  >
                    {recordMutation.isPending
                      ? <><Spinner /><span>Saving…</span></>
                      : <><Landmark size={16} strokeWidth={2} /><span>Record Settlement</span></>
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </Reveal>
  )
}
