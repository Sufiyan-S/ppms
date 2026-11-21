import { useState, useEffect } from 'react'
import { withToggled } from '../../utils/setToggle'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Trash2, Truck } from 'lucide-react'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock, TankerDelivery } from '../../api/inventoryApi'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import { parseApiError } from '../../utils/apiError'
import { IconButton } from '../../components/IconButton'
import { DeleteInvoiceModal } from './DeleteInvoiceModal'
import { DeliveryItem } from './DeliveryItem'
import { fmtDate } from './inventoryFormat'

interface Props {
  pumpId: number
  tanks: TankStock[]
  isOwnerOrAdmin: boolean
  canDeleteInvoice: boolean
}

export function DeliveryHistory({ pumpId, tanks, isOwnerOrAdmin, canDeleteInvoice }: Props) {
  const queryClient = useQueryClient()
  const [deliveryHistOpen,  setDeliveryHistOpen]  = useState(false)
  const [deliveryPage,      setDeliveryPage]      = useState(0)
  const [deliveryPageSize,  setDeliveryPageSize]  = useState(10)
  const [deliveryTankFilter, setDeliveryTankFilter] = useState('')
  const [deliveryFuelFilter, setDeliveryFuelFilter] = useState('')
  const [collapsedDeliveries,    setCollapsedDeliveries]    = useState<Set<string>>(new Set())
  const [deleteInvoice,          setDeleteInvoice]          = useState<{ invoice: string; rows: TankerDelivery[] } | null>(null)

  const deleteLatestMutation = useMutation({
    mutationFn: () => inventoryApi.deleteLatestDelivery(pumpId),
    onSuccess: () => {
      setDeleteInvoice(null)
      queryClient.invalidateQueries({ queryKey: ['deliveries', pumpId] })
      queryClient.invalidateQueries({ queryKey: ['tankStocks', pumpId] })
    },
  })

  const { data: deliveriesPage, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['deliveries', pumpId, deliveryPage, deliveryPageSize],
    queryFn:  () => inventoryApi.getDeliveries(pumpId, deliveryPage, deliveryPageSize),
    enabled:  deliveryHistOpen,
  })
  const deliveries = deliveriesPage?.content ?? []

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

  return (
    <>
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
                <SearchableSelect label="Filter deliveries by tank"
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
                <SearchableSelect label="Filter deliveries by fuel type"
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
                  <div className="p-5 text-sm text-slate-500">
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
                    {groups.map(([invoice, rows], idx) => {
                      const totalQty = rows.reduce((s, r) => s + r.quantityDelivered, 0)
                      const totalCost = rows.reduce((s, r) => s + r.totalCost, 0)
                      const isCollapsed = collapsedDeliveries.has(invoice)
                      const isFirstGlobalGroup = deliveryPage === 0 && idx === 0 && !deliveryTankFilter && !deliveryFuelFilter
                      const toggleDelivery = () => setCollapsedDeliveries(prev => withToggled(prev, invoice))
                      return (
                        <div key={invoice} className="px-5 py-4 space-y-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={toggleDelivery}
                              className="flex-1 flex items-center gap-2 text-left hover:opacity-70 transition-opacity min-w-0"
                            >
                              <span className="text-xs text-slate-500">Bill No.</span>
                              <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md">
                                {invoice}
                              </span>
                              <span className="text-xs text-slate-500">{fmtDate(rows[0].deliveryDate)}</span>
                              <span className="text-xs text-slate-500">·</span>
                              <span className="text-xs text-slate-500">{rows.length} tank{rows.length !== 1 ? 's' : ''}</span>
                              {rows[0].tankerName && (
                                <>
                                  <span className="text-xs text-slate-500">·</span>
                                  <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                                    <Truck size={10} strokeWidth={2} />
                                    {rows[0].tankerName}
                                  </span>
                                </>
                              )}
                              <div className="ml-auto flex items-center gap-3">
                                <span className="text-xs text-slate-500">
                                  {totalQty.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
                                </span>
                                {isOwnerOrAdmin && (rows[0].billTotal != null ? (
                                  <div className="flex flex-col items-end leading-tight">
                                    <span className="text-sm font-bold text-slate-800">
                                      ₹{Number(rows[0].billTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </span>
                                    {Math.abs(Number(rows[0].billTotal) - totalCost) > 0.005 && (
                                      <span className="text-[10px] text-slate-500">
                                        calc. ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-sm font-bold text-slate-800">
                                    ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                ))}
                                <span className={`ui-accordion-arrow ml-1 ${!isCollapsed ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
                              </div>
                            </button>
                            {isFirstGlobalGroup && canDeleteInvoice && (
                              <IconButton
                                onClick={() => setDeleteInvoice({ invoice, rows })}
                                className="shrink-0 ml-2 text-slate-500 hover:text-red-500 transition-colors rounded"
                                label="Delete this invoice"
                                icon={<Trash2 size={14} />}
                              />
                            )}
                          </div>

                          {!isCollapsed && (
                            <div className="ui-accordion-content ui-card p-0 overflow-hidden">
                              <div className="px-4 py-3">
                                <div className={`grid gap-3 border-b border-slate-100 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${
                                  isOwnerOrAdmin
                                    ? 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
                                    : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
                                }`}>
                                  <span>Tank</span>
                                  <span>Fuel</span>
                                  <span className="text-right">Quantity</span>
                                  {isOwnerOrAdmin && <span className="text-right">Rate</span>}
                                  {isOwnerOrAdmin && <span className="text-right">Amount</span>}
                                  <span />
                                </div>
                                <div className="space-y-2 pt-2">
                                  {rows.map(d => <DeliveryItem key={d.id} delivery={d} pumpId={pumpId!} isOwnerOrAdmin={isOwnerOrAdmin} />)}
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
      {deleteInvoice && (
        <DeleteInvoiceModal
          invoice={deleteInvoice.invoice}
          rows={deleteInvoice.rows}
          isPending={deleteLatestMutation.isPending}
          error={deleteLatestMutation.error ? parseApiError(deleteLatestMutation.error, 'Failed to delete invoice') : null}
          onConfirm={() => deleteLatestMutation.mutate()}
          onClose={() => { setDeleteInvoice(null); deleteLatestMutation.reset() }}
        />
      )}
    </>
  )
}
