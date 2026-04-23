import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus, AlertTriangle, AlertCircle, Check, X } from 'lucide-react'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { inventoryApi } from '../../api/inventoryApi'
import { userApi } from '../../api/userApi'
import type { TankStock, TankerDelivery, DipCheck, RecordBatchDeliveryRequest, InventoryLotDetail } from '../../api/inventoryApi'
import { useAuthStore } from '../../store/authStore'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { formatIstDate, localDateInputValue } from '../../utils/date'
import { ModalPortal } from '../../components/ModalPortal'

// ── Colour helpers ─────────────────────────────────────────────────────────────

const FUEL_COLORS: Record<string, { bar: string; text: string; badge: string }> = {
  PETROL: { bar: 'bg-emerald-500', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  DIESEL: { bar: 'bg-blue-500',    text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700'    },
  CNG:    { bar: 'bg-amber-500',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700'  },
}

function fmtQty(n: number | null | undefined) {
  if (n == null) return '—'
  return `${n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
}

function fmtDate(s: string) {
  return formatIstDate(s)
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'

  const { selectedPumpId } = usePumpStore()
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [dipTankId,         setDipTankId]         = useState<number | null>(null)
  const [lotsForTank,       setLotsForTank]       = useState<TankStock | null>(null)
  const [stockOpen,         setStockOpen]         = useState(true)
  const [deliveryHistOpen,  setDeliveryHistOpen]  = useState(false)
  const [dipHistOpen,       setDipHistOpen]       = useState(false)
  const [deliveryPage,      setDeliveryPage]      = useState(0)
  const [deliveryPageSize,  setDeliveryPageSize]  = useState(10)
  const [deliveryTankFilter, setDeliveryTankFilter] = useState('')
  const [deliveryFuelFilter, setDeliveryFuelFilter] = useState('')
  const [dipPage,           setDipPage]           = useState(0)
  const [dipPageSize,       setDipPageSize]       = useState(10)
  const [dipTankFilter,          setDipTankFilter]          = useState('')
  const [dipFuelFilter,          setDipFuelFilter]          = useState('')
  const [collapsedDeliveries,    setCollapsedDeliveries]    = useState<Set<string>>(new Set())
  const [collapsedDipGroups,     setCollapsedDipGroups]     = useState<Set<string>>(new Set())

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    enabled:  isOwnerOrAdmin,
  })
  const sortedPumps = [...pumps].sort((a, b) => a.name.localeCompare(b.name))

  const pumpId = selectedPumpId

  const { data: tanks = [], isLoading: tanksLoading } = useQuery({
    queryKey: ['tankStocks', pumpId],
    queryFn:  () => inventoryApi.getTankStocks(pumpId!),
    enabled:  !!pumpId,
    refetchInterval: 60_000,
  })

  const { data: deliveriesPage, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['deliveries', pumpId, deliveryPage, deliveryPageSize],
    queryFn:  () => inventoryApi.getDeliveries(pumpId!, deliveryPage, deliveryPageSize),
    enabled:  !!pumpId && deliveryHistOpen,
  })
  const deliveries = deliveriesPage?.content ?? []

  // Always fetch DIP checks (page 0 only) so we can compute overdue alerts on every page load.
  // The history accordion adds its own paginated query when opened.
  const { data: dipChecksAlertPage } = useQuery({
    queryKey: ['dipChecks', pumpId, 'alert'],
    queryFn:  () => inventoryApi.getDipChecks(pumpId!, 0, 50),
    enabled:  !!pumpId,
    // Refresh every 10 minutes so the alert badge stays current without a page reload
    refetchInterval: 10 * 60_000,
  })

  const { data: dipChecksPage, isLoading: dipLoading } = useQuery({
    queryKey: ['dipChecks', pumpId, dipPage, dipPageSize],
    queryFn:  () => inventoryApi.getDipChecks(pumpId!, dipPage, dipPageSize),
    enabled:  !!pumpId && dipHistOpen,
  })
  const dipChecks = dipChecksPage?.content ?? []

  // When delivery data loads, collapse all groups except the first (newest) one
  useEffect(() => {
    const content = deliveriesPage?.content
    if (!content?.length) return
    const keys = [...new Set(content.map(d => d.invoiceReference || 'No Invoice'))]
      .sort((a, b) => {
        const dateA = content.find(d => (d.invoiceReference || 'No Invoice') === a)?.deliveryDate ?? ''
        const dateB = content.find(d => (d.invoiceReference || 'No Invoice') === b)?.deliveryDate ?? ''
        return dateB.localeCompare(dateA)
      })
    setCollapsedDeliveries(new Set(keys.slice(1)))
  }, [deliveriesPage])

  // When DIP data loads, collapse all groups except the first (newest) one
  useEffect(() => {
    const content = dipChecksPage?.content
    if (!content?.length) return
    const keys = [...new Set(content.map(d => d.checkedAt.slice(0, 10)))]
      .sort((a, b) => b.localeCompare(a))
    setCollapsedDipGroups(new Set(keys.slice(1)))
  }, [dipChecksPage])

  // Compute last-checked timestamp per tank from alert page (newest-first, page 0)
  const lastDipByTankId = new Map<number, Date>()
  for (const d of (dipChecksAlertPage?.content ?? [])) {
    if (!lastDipByTankId.has(d.tankId)) {
      lastDipByTankId.set(d.tankId, new Date(d.checkedAt))
    }
  }


  const now = Date.now()
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

  // A tank is DIP-overdue if it has never been checked OR last check was >24 h ago
  const dipOverdueTanks = tanks.filter(t => {
    const last = lastDipByTankId.get(t.tankId)
    return !last || now - last.getTime() > TWENTY_FOUR_HOURS
  })

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm">
          You are not assigned to any pump. Ask the Owner or Admin to assign you.
        </div>
      </div>
    )
  }

  const selectedPump = sortedPumps.find(p => p.id === pumpId)
  const lowStockTanks = tanks.filter(t => t.lowStock)

  return (
    <div className="ui-page ui-page--narrow space-y-5">
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Stock control</p>
          <h2 className="ui-title-sm">Inventory</h2>
          <p className="ui-subtitle">
            Tank stock levels, tanker deliveries, and DIP checks.
          </p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Low stock</span>
            <span className="ui-section-meta-value">{lowStockTanks.length}</span>
          </div>
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">DIP overdue</span>
            <span className="ui-section-meta-value">{dipOverdueTanks.length}</span>
          </div>
        </div>
      </div>

      {!pumpId ? (
        <div className="ui-empty">
          No pump selected. Use the pump selector in the top navigation bar.
        </div>
      ) : (
        <>
          {/* ── Low stock alert banner ── */}
          {lowStockTanks.length > 0 && (
            <div className="ui-alert ui-alert-danger flex items-center gap-3">
              <AlertTriangle size={18} strokeWidth={2} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                {lowStockTanks.length === 1
                  ? `${lowStockTanks[0].tankIdentifier} (${lowStockTanks[0].fuelType}) is below 20% capacity.`
                  : `${lowStockTanks.length} tanks are below 20% capacity. Schedule a delivery soon.`}
              </p>
            </div>
          )}

          {/* ── DIP overdue alert banner ── */}
          {dipOverdueTanks.length > 0 && (
            <div className="ui-alert ui-alert-danger flex items-center gap-3">
              <AlertCircle size={18} strokeWidth={2} className="text-red-500 shrink-0" />
              <div>
                <p className="text-sm text-red-700 font-medium">
                  {dipOverdueTanks.length === 1
                    ? `DIP check overdue on ${dipOverdueTanks[0].tankIdentifier} (${dipOverdueTanks[0].fuelType}).`
                    : `DIP check overdue on ${dipOverdueTanks.length} tanks.`}
                </p>
                <p className="text-xs text-red-500 mt-0.5">
                  DIP checks should be done at least once every 24 hours to verify physical stock levels.
                </p>
              </div>
            </div>
          )}

          {/* ── Tank stock levels ── */}
          <div className="ui-card p-0">
            {/* Header row — always visible, clickable to toggle */}
            <div className="ui-toolbar border-b-0">
              <button
                type="button"
                onClick={() => setStockOpen(v => !v)}
                className="flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
              >
                <span className="ui-toolbar-title mr-0">Current Stock Levels</span>
                {selectedPump && (
                  <span className="text-xs text-slate-400">{selectedPump.name}</span>
                )}
                <span className={`ui-accordion-arrow ml-1 ${stockOpen ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
              </button>
              {isOwnerOrAdmin && (
                <button
                  onClick={() => setShowDeliveryModal(true)}
                  className="ui-btn ui-btn-primary shrink-0 ml-auto inline-flex items-center gap-1.5"
                >
                  <Plus size={14} strokeWidth={2.5} />
                  Record Delivery
                </button>
              )}
            </div>

            {stockOpen && (
              <div className="ui-accordion-content border-t border-slate-100">
                {tanksLoading ? (
                  <div className="p-6 text-sm text-slate-500">Loading stock levels...</div>
                ) : tanks.length === 0 ? (
                  <div className="p-6 text-sm text-slate-400">
                    No tanks configured. Add nozzles in Setup to auto-create tanks.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {tanks.map(tank => {
                      const last = lastDipByTankId.get(tank.tankId)
                      const dipOverdue = !last || now - last.getTime() > TWENTY_FOUR_HOURS
                      return (
                        <TankStockBar
                          key={tank.tankId}
                          tank={tank}
                          dipOverdue={dipOverdue}
                          lastDipAt={last}
                          onDipCheck={isOwnerOrAdmin ? () => setDipTankId(tank.tankId) : undefined}
                          onViewLots={() => setLotsForTank(tank)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Delivery history accordion ── */}
          <div className="ui-card p-0 overflow-hidden">
            <button
              onClick={() => setDeliveryHistOpen(v => !v)}
              className="ui-accordion-trigger"
            >
              <span className="ui-accordion-title">Tanker Delivery History</span>
              <span className={`ui-accordion-arrow ${deliveryHistOpen ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
            </button>
            {deliveryHistOpen && (
              <div className="ui-accordion-content border-t border-slate-100">
                <div className="ui-toolbar">
                  <p className="ui-toolbar-title">Filter Deliveries</p>
                  <div className="ui-toolbar-actions">
                    <div className="w-44">
                    <SearchableSelect
                      value={deliveryTankFilter}
                      onChange={v => setDeliveryTankFilter(v)}
                      options={[
                        { value: '', label: 'All Tanks' },
                        ...tanks.map(t => ({ value: t.tankIdentifier, label: t.tankIdentifier })),
                      ]}
                      placeholder="Filter by tank"
                    />
                  </div>
                    <div className="w-44">
                    <SearchableSelect
                      value={deliveryFuelFilter}
                      onChange={v => setDeliveryFuelFilter(v)}
                      options={[
                        { value: '', label: 'All Fuel Types' },
                        ...Array.from(new Set(tanks.map(t => t.fuelType))).map(ft => ({ value: ft, label: ft })),
                      ]}
                      placeholder="Filter by fuel type"
                    />
                  </div>
                    {(deliveryTankFilter || deliveryFuelFilter) && (
                      <button
                        onClick={() => { setDeliveryTankFilter(''); setDeliveryFuelFilter('') }}
                        className="ui-btn ui-btn-ghost text-xs"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>

                {deliveriesLoading ? (
                  <div className="p-5 text-sm text-slate-500">Loading...</div>
                ) : (() => {
                  // Apply client-side filters on the current page's data
                  const filtered = deliveries.filter(d =>
                    (!deliveryTankFilter || d.tankIdentifier === deliveryTankFilter) &&
                    (!deliveryFuelFilter || d.fuelType === deliveryFuelFilter)
                  )

                  if (filtered.length === 0) {
                    return (
                      <div className="p-5 text-sm text-slate-400">
                        {deliveries.length === 0
                          ? 'No deliveries recorded yet.'
                          : 'No deliveries match the selected filters on this page.'}
                      </div>
                    )
                  }

                  // Group by invoice number, sorted newest-first (within current page)
                  const groups = Object.entries(
                    filtered.reduce<Record<string, TankerDelivery[]>>((acc, d) => {
                      const key = d.invoiceReference || 'No Invoice'
                      ;(acc[key] ??= []).push(d)
                      return acc
                    }, {})
                  ).sort(([, a], [, b]) => b[0].deliveryDate.localeCompare(a[0].deliveryDate))

                  return (
                    <>
                      <div className="divide-y divide-slate-100">
                        {groups.map(([invoice, rows]) => {
                          const totalQty = rows.reduce((s, r) => s + r.quantityDelivered, 0)
                          const totalCost = rows.reduce((s, r) => s + r.totalCost, 0)
                          const isCollapsed = collapsedDeliveries.has(invoice)
                          const toggleDelivery = () => setCollapsedDeliveries(prev => {
                            const next = new Set(prev)
                            next.has(invoice) ? next.delete(invoice) : next.add(invoice)
                            return next
                          })
                          return (
                            <div key={invoice} className="px-5 py-4 space-y-2">
                              <button
                                type="button"
                                onClick={toggleDelivery}
                                className="w-full flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
                              >
                                <span className="text-xs text-slate-500">Bill No.</span>
                                <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md">
                                  {invoice}
                                </span>
                                <span className="text-xs text-slate-400">{fmtDate(rows[0].deliveryDate)}</span>
                                <span className="text-xs text-slate-400">·</span>
                                <span className="text-xs text-slate-500">{rows.length} tank{rows.length !== 1 ? 's' : ''}</span>
                                <div className="ml-auto flex items-center gap-3">
                                  <span className="text-xs text-slate-500">
                                    {totalQty.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                                  </span>
                                  <span className="text-sm font-bold text-slate-800">
                                    ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                  <span className={`ui-accordion-arrow ml-1 ${!isCollapsed ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
                                </div>
                              </button>

                              {!isCollapsed && (
                                <div className="ui-accordion-content ui-card p-0 overflow-hidden">
                                  <div className="px-4 py-3">
                                    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                      <span>Tank</span>
                                      <span>Fuel</span>
                                      <span className="text-right">Quantity</span>
                                      <span className="text-right">Rate</span>
                                      <span className="text-right">Amount</span>
                                    </div>
                                    <div className="space-y-2 pt-2">
                                      {rows.map(d => <DeliveryItem key={d.id} delivery={d} />)}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {deliveriesPage && (
                        <div className="px-5">
                          <Pagination
                            data={deliveriesPage}
                            onPageChange={p => setDeliveryPage(p)}
                            onPageSizeChange={s => { setDeliveryPageSize(s); setDeliveryPage(0) }}
                            pageSizeOptions={[10, 20, 50]}
                          />
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>

          {/* ── DIP check history accordion ── */}
          <div className="ui-card p-0 overflow-hidden">
            <button
              onClick={() => setDipHistOpen(v => !v)}
              className="ui-accordion-trigger"
            >
              <span className="ui-accordion-title">DIP Check History</span>
              <span className={`ui-accordion-arrow ${dipHistOpen ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
            </button>
            {dipHistOpen && (
              <div className="ui-accordion-content border-t border-slate-100">
                <div className="ui-toolbar">
                  <p className="ui-toolbar-title">Filter DIP Checks</p>
                  <div className="ui-toolbar-actions">
                    <div className="w-44">
                    <SearchableSelect
                      value={dipTankFilter}
                      onChange={v => setDipTankFilter(v)}
                      options={[
                        { value: '', label: 'All Tanks' },
                        ...tanks.map(t => ({ value: t.tankIdentifier, label: t.tankIdentifier })),
                      ]}
                      placeholder="Filter by tank"
                    />
                  </div>
                    <div className="w-44">
                    <SearchableSelect
                      value={dipFuelFilter}
                      onChange={v => setDipFuelFilter(v)}
                      options={[
                        { value: '', label: 'All Fuel Types' },
                        ...Array.from(new Set(tanks.map(t => t.fuelType))).map(ft => ({ value: ft, label: ft })),
                      ]}
                      placeholder="Filter by fuel type"
                    />
                  </div>
                    {(dipTankFilter || dipFuelFilter) && (
                      <button
                        onClick={() => { setDipTankFilter(''); setDipFuelFilter('') }}
                        className="ui-btn ui-btn-ghost text-xs"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>

                {dipLoading ? (
                  <div className="p-5 text-sm text-slate-500">Loading...</div>
                ) : (() => {
                  // Apply client-side filters on the current page's data
                  const filtered = dipChecks.filter(d =>
                    (!dipTankFilter || d.tankIdentifier === dipTankFilter) &&
                    (!dipFuelFilter || d.fuelType === dipFuelFilter)
                  )

                  if (filtered.length === 0) {
                    return (
                      <div className="p-5 text-sm text-slate-400">
                        {dipChecks.length === 0
                          ? 'No DIP checks recorded yet.'
                          : 'No DIP checks match the selected filters on this page.'}
                      </div>
                    )
                  }

                  // Group by calendar date, sorted newest-first (within current page)
                  const groups = Object.entries(
                    filtered.reduce<Record<string, DipCheck[]>>((acc, d) => {
                      const key = d.checkedAt.slice(0, 10)
                      ;(acc[key] ??= []).push(d)
                      return acc
                    }, {})
                  ).sort(([a], [b]) => b.localeCompare(a))

                  return (
                    <>
                    <div className="divide-y divide-slate-100">
                      {groups.map(([dateKey, rows]) => {
                        const allBalanced = rows.every(r => r.variance === 0)
                        const isCollapsed = collapsedDipGroups.has(dateKey)
                        const toggleDip = () => setCollapsedDipGroups(prev => {
                          const next = new Set(prev)
                          next.has(dateKey) ? next.delete(dateKey) : next.add(dateKey)
                          return next
                        })
                        return (
                          <div key={dateKey} className="px-5 py-4 space-y-2">
                            <button
                              type="button"
                              onClick={toggleDip}
                              className="w-full flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
                            >
                              <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                                {fmtDate(dateKey)}
                              </span>
                              <span className="text-xs text-slate-400">
                                {rows.length} tank{rows.length !== 1 ? 's' : ''} checked
                              </span>
                              {allBalanced && (
                                <span className="ml-auto text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  All Balanced
                                </span>
                              )}
                              {!allBalanced && (
                                <span className="ml-auto text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                  Variance Detected
                                </span>
                              )}
                              <span className={`ui-accordion-arrow ml-1 ${!isCollapsed ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
                            </button>
                            {!isCollapsed && (
                              <div className="ui-accordion-content space-y-1.5">
                                {rows.map(d => (
                                  <DipItem
                                    key={d.id}
                                    check={d}
                                    pumpId={selectedPumpId!}
                                    canReview={isOwnerOrAdmin}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {dipChecksPage && (
                      <div className="px-5">
                        <Pagination
                          data={dipChecksPage}
                          onPageChange={p => setDipPage(p)}
                          onPageSizeChange={s => { setDipPageSize(s); setDipPage(0) }}
                          pageSizeOptions={[10, 20, 50]}
                        />
                      </div>
                    )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {showDeliveryModal && pumpId && (
        <RecordDeliveryModal
          pumpId={pumpId}
          tanks={tanks}
          onClose={() => setShowDeliveryModal(false)}
        />
      )}
      {dipTankId !== null && pumpId && (
        <DipCheckModal
          pumpId={pumpId}
          tank={tanks.find(t => t.tankId === dipTankId)!}
          onClose={() => setDipTankId(null)}
        />
      )}
      {lotsForTank !== null && pumpId && (
        <FuelLotsDialog
          pumpId={pumpId}
          tank={lotsForTank}
          onClose={() => setLotsForTank(null)}
        />
      )}
    </div>
  )
}

// ── Tank stock bar ─────────────────────────────────────────────────────────────

function TankStockBar({
  tank,
  dipOverdue,
  lastDipAt,
  onDipCheck,
  onViewLots,
}: {
  tank: TankStock
  dipOverdue: boolean
  lastDipAt: Date | undefined
  onDipCheck?: () => void
  onViewLots: () => void
}) {
  const pct  = Math.min(100, Math.max(0, tank.stockPercentage))
  const cols = FUEL_COLORS[tank.fuelType] ?? FUEL_COLORS.PETROL
  const isLow = tank.lowStock

  // Human-readable time since last DIP (e.g. "8 h ago", "3 d ago")
  function timeSinceDip(d: Date) {
    const diffMs = Date.now() - d.getTime()
    const h = Math.floor(diffMs / (1000 * 60 * 60))
    if (h < 24) return `${h} h ago`
    return `${Math.floor(h / 24)} d ago`
  }

  return (
    <div className={`px-5 py-4 ${dipOverdue ? 'bg-red-50/40' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cols.badge}`}>
            {tank.fuelType}
          </span>
          <span className="text-sm font-semibold text-slate-700">{tank.tankIdentifier}</span>
          {isLow && (
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium animate-pulse">
              LOW STOCK
            </span>
          )}
          {dipOverdue && (
            <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-medium">
              DIP OVERDUE {lastDipAt ? `· last ${timeSinceDip(lastDipAt)}` : '· never checked'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isLow ? 'text-red-600' : 'text-slate-500'}`}>
            {pct.toFixed(1)}%
          </span>
          <button
            onClick={onViewLots}
            className="ui-btn ui-btn-secondary min-h-0 px-2.5 py-1 text-xs"
          >
            View Lots
          </button>
          {onDipCheck && (
            <button
              onClick={onDipCheck}
              className="ui-btn ui-btn-ghost min-h-0 px-2.5 py-1 text-xs text-blue-600 border border-blue-200 hover:border-blue-400 hover:text-blue-800"
            >
              DIP Check
            </button>
          )}
        </div>
      </div>

      {/* Animated stock bar */}
      <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isLow ? 'bg-red-500 animate-pulse' : cols.bar
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between mt-1.5 text-xs text-slate-400">
        <span>
          <span className={`font-semibold ${isLow ? 'text-red-600' : 'text-slate-700'}`}>
            {tank.currentStock.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
          </span>
          {' '}remaining
        </span>
        <span>Capacity: {tank.capacity.toLocaleString('en-IN', { minimumFractionDigits: 0 })} L</span>
      </div>
    </div>
  )
}

// ── Fuel Lots Dialog ──────────────────────────────────────────────────────────
/**
 * Read-only dialog showing ACTIVE FIFO inventory lots for a specific tank.
 * Columns: In Date, Invoice (Bill No), Cost Price/L, Remaining (L), Original (L).
 * DIP-adjustment lots are labelled "DIP Adj." in the Invoice column and show 0 cost.
 * No edit — view only.
 */
function FuelLotsDialog({
  pumpId, tank, onClose,
}: {
  pumpId: number
  tank: TankStock
  onClose: () => void
}) {
  const { data: lots = [], isLoading } = useQuery<InventoryLotDetail[]>({
    queryKey: ['fuelLots', pumpId, tank.tankId],
    queryFn:  () => inventoryApi.getActiveTankLots(pumpId, tank.tankId),
  })

  const cols = FUEL_COLORS[tank.fuelType] ?? FUEL_COLORS.PETROL

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop px-4">
      <div className="ui-modal-panel ui-modal-panel--lg w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="ui-modal-header shrink-0">
          <div className="ui-modal-heading flex items-center gap-2.5">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cols.badge}`}>
              {tank.fuelType}
            </span>
            <div>
              <h3 className="ui-modal-title">Stock Lots — {tank.tankIdentifier}</h3>
              <p className="ui-modal-subtitle">
                Current stock: {tank.currentStock.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
              </p>
            </div>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Body */}
        <div className="ui-modal-body overflow-auto flex-1">
          {isLoading ? (
            <p className="ui-empty py-8">Loading lots…</p>
          ) : lots.length === 0 ? (
            <p className="ui-empty py-8">
              No active stock lots for this tank. Record a tanker delivery first.
            </p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-200">
                  <th className="text-left pb-2 pr-4 font-medium">In Date</th>
                  <th className="text-left pb-2 pr-4 font-medium">Invoice / Bill No</th>
                  <th className="text-right pb-2 pr-4 font-medium">Cost Price/L</th>
                  <th className="text-right pb-2 pr-4 font-medium">Remaining (L)</th>
                  <th className="text-right pb-2 font-medium">Original (L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lots.map((lot, idx) => (
                  <tr key={lot.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="py-2.5 pr-4 text-slate-700">{fmtDate(lot.deliveryDate)}</td>
                    <td className="py-2.5 pr-4 text-slate-500">
                      {lot.isDipAdjustment
                        ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">DIP Adj.</span>
                        : (lot.invoiceReference ?? '—')}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium text-slate-800">
                      {lot.isDipAdjustment
                        ? <span className="text-slate-400">—</span>
                        : `₹${Number(lot.costPricePerUnit).toFixed(4)}`}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <span className="font-semibold text-emerald-700">
                        {Number(lot.remainingQuantity).toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                      </span>
                    </td>
                    <td className="py-2.5 text-right text-slate-500">
                      {Number(lot.originalQuantity).toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="ui-modal-footer shrink-0 justify-between items-center">
          <p className="text-xs text-slate-400">
            Lots shown in FIFO order — oldest consumed first
          </p>
          <button
            onClick={onClose}
            className="ui-btn ui-btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Delivery item (compact card inside invoice group) ─────────────────────────

function DeliveryItem({ delivery }: { delivery: TankerDelivery }) {
  const cols = FUEL_COLORS[delivery.fuelType] ?? FUEL_COLORS.PETROL
  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs items-center">
      <span className="font-semibold text-slate-700">{delivery.tankIdentifier}</span>
      <span className={`font-medium px-2 py-0.5 rounded-full justify-self-start ${cols.badge}`}>
        {delivery.fuelType}
      </span>
      <span className="text-right text-slate-600">
        {delivery.quantityDelivered.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
      </span>
      <span className="text-right text-slate-400">₹{delivery.costPricePerUnit.toFixed(4)}/L</span>
      <span className="text-right font-semibold text-slate-800">
        ₹{delivery.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </span>
    </div>
  )
}

// ── DIP item (compact card inside date group) ──────────────────────────────────

function DipItem({ check, pumpId, canReview }: {
  check: DipCheck
  pumpId: number
  canReview: boolean
}) {
  const qc = useQueryClient()
  const cols = FUEL_COLORS[check.fuelType] ?? FUEL_COLORS.PETROL
  const over = check.variance > 0

  const reviewMutation = useMutation({
    mutationFn: () => inventoryApi.reviewDipCheck(pumpId, check.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dipChecks', pumpId] }),
  })

  const statusBadge = () => {
    if (check.status === 'WITHIN_TOLERANCE') return null
    if (check.status === 'PENDING_REVIEW') {
      return (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 shrink-0">
          Needs Review
        </span>
      )
    }
    return (
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
        Reviewed{check.reviewedByUserName ? ` · ${check.reviewedByUserName}` : ''}
      </span>
    )
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2.5 ${
      check.status === 'PENDING_REVIEW' ? 'bg-red-50 border border-red-100' : 'bg-slate-50'
    }`}>
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${cols.badge}`}>
        {check.fuelType}
      </span>
      <span className="text-xs font-semibold text-slate-700 w-14 shrink-0">{check.tankIdentifier}</span>
      <span className="text-xs text-slate-500 shrink-0">
        Measured: <span className="font-medium text-slate-700">{fmtQty(check.measuredQuantity)}</span>
      </span>
      <span className="text-xs text-slate-400 shrink-0">System: {fmtQty(check.systemStock)}</span>
      <span className="shrink-0">
        {check.variance === 0 ? (
          <span className="text-xs text-emerald-600 font-medium">Balanced</span>
        ) : (
          <span className={`text-xs font-semibold ${over ? 'text-amber-600' : 'text-red-600'}`}>
            {over ? '+' : ''}{check.variance.toFixed(1)} L
          </span>
        )}
      </span>
      {statusBadge()}
      {check.status === 'PENDING_REVIEW' && canReview && (
        <button
          onClick={() => reviewMutation.mutate()}
          disabled={reviewMutation.isPending}
          className="ui-btn ui-btn-danger min-h-0 px-2.5 py-0.5 text-xs rounded-full disabled:opacity-50 shrink-0"
        >
          {reviewMutation.isPending ? '…' : 'Acknowledge'}
        </button>
      )}
      {check.notes && (
        <span className="text-xs text-slate-400 italic shrink-0">{check.notes}</span>
      )}
      <span className="ml-auto text-xs text-slate-400 shrink-0">{check.loggedByUserName}</span>
    </div>
  )
}

// ── Record Delivery Modal ─────────────────────────────────────────────────────

interface DeliveryRow {
  id: number
  tankId: string
  qty: string
  costPrice: string
}

interface PreparedDeliveryItem {
  tankId: number
  tankIdentifier: string
  fuelType: string
  quantityDelivered: number
  costPricePerUnit: number
  totalCost: number
  stockAfter: number | null
  capacity: number | null
}

let _rowSeq = 0
function newRow(defaultTankId = ''): DeliveryRow {
  return { id: ++_rowSeq, tankId: defaultTankId, qty: '', costPrice: '' }
}

function RecordDeliveryModal({
  pumpId,
  tanks,
  onClose,
}: {
  pumpId: number
  tanks: TankStock[]
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const defaultTankId = tanks[0]?.tankId ? String(tanks[0].tankId) : ''

  const [date,          setDate]          = useState(localDateInputValue())
  const [invoice,       setInvoice]       = useState('')
  const [rows,          setRows]          = useState<DeliveryRow[]>([newRow(defaultTankId)])
  const [expandedRowId, setExpandedRowId] = useState<number | null>(() => _rowSeq)
  const [error,         setError]         = useState<string | null>(null)
  const [reviewOpen,    setReviewOpen]    = useState(false)

  const mutation = useMutation({
    mutationFn: (req: RecordBatchDeliveryRequest) =>
      inventoryApi.recordBatchDelivery(pumpId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['deliveries', pumpId] })
      onClose()
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Failed to record delivery'),
  })

  const updateRow = (id: number, field: keyof Omit<DeliveryRow, 'id'>, value: string) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))

  const addRow = () => {
    const r = newRow(defaultTankId)
    setRows(prev => [...prev, r])
    setExpandedRowId(r.id)
  }

  const removeRow = (id: number) => {
    setRows(prev => prev.filter(r => r.id !== id))
    if (expandedRowId === id) setExpandedRowId(null)
  }

  const grandTotal = rows.reduce((sum, r) => {
    const q = parseFloat(r.qty) || 0
    const c = parseFloat(r.costPrice) || 0
    return sum + q * c
  }, 0)

  const buildPreparedItems = (): { items: PreparedDeliveryItem[] | null; error: string | null } => {
    if (!date || !invoice.trim()) {
      return { items: null, error: 'Delivery date and invoice number are required.' }
    }

    for (const r of rows) {
      if (!r.tankId) return { items: null, error: 'Please select a tank for every row.' }
      const q = parseFloat(r.qty)
      const c = parseFloat(r.costPrice)
      if (!r.qty || isNaN(q) || q <= 0) return { items: null, error: 'Quantity must be greater than 0 for every row.' }
      if (!r.costPrice || isNaN(c) || c <= 0) return { items: null, error: 'Cost per litre must be greater than 0 for every row.' }
    }

    const selectedTankIds = rows.map(r => r.tankId)
    const unique = new Set(selectedTankIds)
    if (unique.size !== selectedTankIds.length) {
      return { items: null, error: 'The same tank is selected more than once. Each tank can only appear once per delivery.' }
    }

    const preparedItems = rows.map((r) => {
      const tank = tanks.find(t => t.tankId === Number(r.tankId))
      if (!tank) {
        throw new Error('Selected tank not found.')
      }

      const quantityDelivered = parseFloat(r.qty)
      const costPricePerUnit = parseFloat(r.costPrice)

      return {
        tankId: tank.tankId,
        tankIdentifier: tank.tankIdentifier,
        fuelType: tank.fuelType,
        quantityDelivered,
        costPricePerUnit,
        totalCost: quantityDelivered * costPricePerUnit,
        stockAfter: tank.currentStock + quantityDelivered,
        capacity: tank.capacity,
      }
    })

    return { items: preparedItems, error: null }
  }

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    try {
      const { items, error } = buildPreparedItems()
      if (error || !items) {
        setError(error)
        return
      }

      setReviewOpen(true)
    } catch {
      setError('One of the selected tanks could not be found. Please review the entries.')
      return
    }
  }

  const handleConfirmSubmit = () => {
    try {
      const { items, error } = buildPreparedItems()
      if (error || !items) {
        setError(error)
        return
      }

      mutation.mutate({
        deliveryDate:     date,
        invoiceReference: invoice.trim(),
        items: items.map(item => ({
          tankId: item.tankId,
          quantityDelivered: item.quantityDelivered,
          costPricePerUnit: item.costPricePerUnit,
        })),
      })
    } catch {
      setError('One of the selected tanks could not be found. Please review the entries.')
    }
  }

  const tankOptions = tanks.map(t => ({
    value: String(t.tankId),
    label: `${t.tankIdentifier} — ${t.fuelType} (${t.currentStock.toFixed(0)} L remaining)`,
  }))

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div
        className="ui-modal-panel"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info flex-shrink-0">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">Record Tanker Delivery</h2>
            <p className="ui-modal-subtitle">
              One tanker · one invoice · multiple tanks
            </p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">×</button>
        </div>

        <form onSubmit={handleReview} className="flex flex-col flex-1 overflow-hidden">
          {/* Shared fields — delivery date + invoice */}
          <div className="ui-modal-body border-b border-slate-100 flex-shrink-0">
            <div className="ui-inline-form">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="ui-label">
                  Delivery Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="shadow-sm"
                />
              </div>
              <div>
                <label className="ui-label">
                  Invoice / Bill No. <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={invoice}
                  onChange={e => setInvoice(e.target.value)}
                  placeholder="e.g. INV-2026-0042"
                  className="shadow-sm"
                />
              </div>
            </div>
            </div>
          </div>

          {/* Scrollable tank rows */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {rows.map((row, idx) => {
              const tank       = tanks.find(t => t.tankId === Number(row.tankId))
              const rowCost    = (parseFloat(row.qty) || 0) * (parseFloat(row.costPrice) || 0)
              const afterStock = tank ? tank.currentStock + (parseFloat(row.qty) || 0) : null
              const isExpanded = expandedRowId === row.id
              const isFilled   = !!row.tankId && parseFloat(row.qty) > 0 && parseFloat(row.costPrice) > 0

              return (
                <div key={row.id} className="ui-card ui-card-muted overflow-hidden">
                  {/* ── Collapsed summary row ── */}
                  {!isExpanded ? (
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs font-bold text-slate-400 shrink-0">#{idx + 1}</span>
                        {isFilled ? (
                          <>
                            <span className="text-sm font-medium text-slate-700 truncate">
                              {tank?.tankIdentifier ?? '—'} · {tank?.fuelType ?? '—'}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">{parseFloat(row.qty).toLocaleString('en-IN')} L</span>
                            <span className="text-sm font-semibold text-blue-700 shrink-0">
                              ₹{rowCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Incomplete — click Edit to fill</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <button
                          type="button"
                          onClick={() => setExpandedRowId(row.id)}
                          className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                        >
                          Edit
                        </button>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="text-red-300 hover:text-red-600 transition-colors p-0.5"
                            title="Remove"
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Expanded form ── */
                    <div className="p-4 space-y-3">
                      {/* Row header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Tank {idx + 1}
                        </span>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="ui-btn ui-btn-ghost min-h-8 px-0 py-0 text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Remove
                          </button>
                        )}
                      </div>

                      {/* Tank selector */}
                      <div>
                        <label className="ui-label">Tank</label>
                        <SearchableSelect
                          value={row.tankId}
                          onChange={v => updateRow(row.id, 'tankId', v)}
                          options={tankOptions}
                          placeholder="Select tank…"
                        />
                      </div>

                      {/* Qty + Cost */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="ui-label">
                            Quantity (Litres) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={row.qty}
                            onChange={e => updateRow(row.id, 'qty', e.target.value)}
                            placeholder="e.g. 5000"
                            className="shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="ui-label">
                            Cost per Litre (₹) <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={row.costPrice}
                            onChange={e => updateRow(row.id, 'costPrice', e.target.value)}
                            placeholder="e.g. 88.50"
                            className="shadow-sm"
                          />
                        </div>
                      </div>

                      {/* Per-row live previews */}
                      {(rowCost > 0 || afterStock !== null) && (
                        <div className="flex items-center gap-3 text-xs">
                          {rowCost > 0 && (
                            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg font-medium">
                              ₹{rowCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })} delivery cost
                            </span>
                          )}
                          {afterStock !== null && row.qty && (
                            <span className="text-slate-400">
                              Stock after: <span className="font-semibold text-slate-600">
                                {afterStock.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                              </span>
                              {tank && ` / ${tank.capacity.toLocaleString('en-IN', { minimumFractionDigits: 0 })} L`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Collapse button */}
                      {isFilled && (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setExpandedRowId(null)}
                            className="ui-btn ui-btn-ghost text-xs px-3 py-1.5 min-h-0"
                          >
                            Done
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add another tank button */}
            <button
              type="button"
              onClick={addRow}
              className="ui-btn ui-btn-secondary w-full border-2 border-dashed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add another tank
            </button>
          </div>

          {/* Footer — grand total + actions */}
          <div className="ui-modal-footer flex-shrink-0 space-y-0 block">
            {/* Grand total */}
            {grandTotal > 0 && (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Grand Total ({rows.length} tank{rows.length > 1 ? 's' : ''})</p>
                </div>
                <p className="text-base font-bold text-blue-800">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}

            {error && (
              <div className="ui-alert ui-alert-danger mb-3 text-xs">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="ui-btn ui-btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="ui-btn ui-btn-primary flex-1"
              >
                {mutation.isPending
                  ? 'Recording…'
                  : 'Review Delivery'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {reviewOpen && (() => {
        try {
          const { items } = buildPreparedItems()
          if (!items) return null

          return (
        <ModalPortal>
        <div className="ui-modal-backdrop" onClick={() => setReviewOpen(false)}>
          <div
            className="ui-modal-panel ui-modal-panel--lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
              <div className="ui-modal-heading">
                <h3 className="ui-modal-title">Review Tanker Delivery</h3>
                <p className="ui-modal-subtitle">Please verify the bill and tank-wise received fuel before submitting.</p>
              </div>
              <button onClick={() => setReviewOpen(false)} className="ui-btn ui-btn-ghost ui-modal-close">×</button>
            </div>

            <div className="ui-modal-body space-y-5 max-h-[75vh]">
              {error && (
                <div className="ui-alert ui-alert-danger text-sm">
                  {error} Go back to modify the data and try again.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium text-slate-500">Delivery Date</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{fmtDate(date)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium text-slate-500">Invoice / Bill No.</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{invoice.trim()}</p>
                </div>
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-[0_10px_20px_rgba(37,99,235,0.08)]">
                  <p className="text-xs font-medium text-blue-600">Grand Total</p>
                  <p className="mt-1 text-base font-bold text-blue-800">
                    ₹{items.reduce((sum, item) => sum + item.totalCost, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="ui-card p-0 overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>Tank</span>
                  <span>Fuel</span>
                  <span className="text-right">Quantity</span>
                  <span className="text-right">Rate</span>
                  <span className="text-right">Amount</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <div key={item.tankId} className="px-4 py-3">
                      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3 items-center text-sm">
                        <span className="font-semibold text-slate-800">{item.tankIdentifier}</span>
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${FUEL_COLORS[item.fuelType]?.badge ?? FUEL_COLORS.PETROL.badge}`}>
                          {item.fuelType}
                        </span>
                        <span className="text-right text-slate-600">
                          {item.quantityDelivered.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                        </span>
                        <span className="text-right text-slate-500">
                          ₹{item.costPricePerUnit.toFixed(4)}/L
                        </span>
                        <span className="text-right font-semibold text-slate-800">
                          ₹{item.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {item.stockAfter !== null && (
                        <p className="mt-2 text-xs text-slate-500">
                          Stock after delivery: <span className="font-medium text-slate-700">
                            {item.stockAfter.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                          </span>
                          {item.capacity !== null && ` / ${item.capacity.toLocaleString('en-IN', { minimumFractionDigits: 0 })} L capacity`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="ui-modal-footer">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                disabled={mutation.isPending}
                className="ui-btn ui-btn-secondary flex-1"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={mutation.isPending}
                className="ui-btn ui-btn-primary flex-1"
              >
                {mutation.isPending ? 'Recording…' : `Confirm ${items.length > 1 ? 'Deliveries' : 'Delivery'}`}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
          )
        } catch {
          return null
        }
      })()}
    </div>
    </ModalPortal>
  )
}

// ── DIP Check Modal ────────────────────────────────────────────────────────────

function DipCheckModal({
  pumpId,
  tank,
  onClose,
}: {
  pumpId: number
  tank: TankStock
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const cols = FUEL_COLORS[tank.fuelType] ?? FUEL_COLORS.PETROL

  const [measured,        setMeasured]        = useState('')
  const [date,            setDate]            = useState(localDateInputValue())
  const [checkedByUserId, setCheckedByUserId] = useState<string>('')
  const [notes,           setNotes]           = useState('')
  const [error,           setError]           = useState<string | null>(null)

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', pumpId],
    queryFn:  () => userApi.getStaff(pumpId),
  })

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.recordDipCheck(pumpId, {
        tankId:           tank.tankId,
        measuredQuantity: Number(measured),
        checkedAt:        date,
        checkedByUserId:  checkedByUserId ? Number(checkedByUserId) : undefined,
        notes:            notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['dipChecks', pumpId] })
      onClose()
    },
    onError: (err: any) =>
      setError(err?.response?.data?.message ?? 'Failed to record DIP check'),
  })

  const variance = measured !== '' ? Number(measured) - tank.currentStock : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!measured || !date) { setError('Measured quantity and date are required.'); return }
    mutation.mutate()
  }

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop" onClick={onClose}>
      <div className="ui-modal-panel w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--neutral">
          <div className="ui-modal-heading">
            <h2 className="ui-modal-title">DIP Check</h2>
            <p className="ui-modal-subtitle">
              {tank.tankIdentifier} — <span className={cols.text.replace('text-', 'text-')}>{tank.fuelType}</span>
            </p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close">×</button>
        </div>

        <form onSubmit={handleSubmit} className="ui-modal-body space-y-4">
          {/* Current system stock */}
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-xs text-slate-500">
            System stock right now:{' '}
            <span className="font-bold text-slate-700">
              {tank.currentStock.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
            </span>
          </div>

          {/* Measured quantity */}
          <div>
            <label className="ui-label">
              Dipstick Reading (Litres)
            </label>
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={measured}
              onChange={e => setMeasured(e.target.value)}
              placeholder="Physically measured quantity"
              className="text-sm"
              autoFocus
            />
          </div>

          {/* Live variance preview */}
          {variance !== null && (
            <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center justify-between ${
              Math.abs(variance) < tank.dipTolerance
                ? 'bg-emerald-50 text-emerald-700'
                : variance > 0
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-red-50 text-red-700'
            }`}>
              <span>
                {Math.abs(variance) < tank.dipTolerance
                  ? <span className="inline-flex items-center gap-1">Within tolerance<Check size={12} strokeWidth={2.5} /></span>
                  : variance > 0
                    ? 'Surplus detected'
                    : 'Shortage detected'}
              </span>
              <span className="font-bold">
                {variance > 0 ? '+' : ''}{variance.toFixed(1)} L variance
              </span>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="ui-label">Check Date</label>
            <input
              required
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Operator */}
          <div>
            <label className="ui-label">
              Checked By <span className="text-slate-400">(optional)</span>
            </label>
            <SearchableSelect
              value={checkedByUserId}
              onChange={v => setCheckedByUserId(v)}
              placeholder="— Select operator —"
              options={staff.map(s => ({
                value: String(s.id),
                label: `${s.fullName} (${s.role.charAt(0) + s.role.slice(1).toLowerCase()})`,
              }))}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="ui-label">
              Notes <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Reading taken at 6pm"
              className="text-sm"
            />
          </div>

          {error && <p className="ui-error-text">{error}</p>}

          <div className="ui-modal-footer -mx-6 -mb-6">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="ui-btn ui-btn-primary flex-1 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400"
            >
              {mutation.isPending ? 'Saving...' : 'Save DIP Check'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  )
}
