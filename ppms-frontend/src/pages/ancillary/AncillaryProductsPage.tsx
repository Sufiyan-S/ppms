import { useState, useEffect, useDeferredValue } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, AlertTriangle, ArrowRight, ChevronLeft } from 'lucide-react'
import { usePumpStore } from '../../store/usePumpStore'
import { ancillaryApi } from '../../api/ancillaryApi'
import { creditApi } from '../../api/creditApi'
import type {
  AncillaryProduct,
  AncillaryLotDetail,
  CreateProductRequest,
  RecordStockDeliveryRequest,
  RecordAncillarySaleRequest,
  BackfillSaleRequest,
  AncillaryPaymentMode,
  UnitOfMeasure,
  UpdateLotRequest,
} from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import { SearchableSelect } from '../../components/SearchableSelect'
import { Pagination } from '../../components/Pagination'
import type { PagedResponse } from '../../types/paged'
import { formatIstDate, localDateInputValue } from '../../utils/date'
import { SkeletonTable } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { Spinner } from '../../components/Spinner'
import { useToastStore } from '../../store/toastStore'
import { ModalPortal } from '../../components/ModalPortal'
import { parseApiError } from '../../utils/apiError'
import { useEscapeKey } from '../../hooks/useEscapeKey'

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number | null | undefined) {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(s: string) {
  return formatIstDate(s)
}

const PAYMENT_MODES: AncillaryPaymentMode[] = ['CASH', 'UPI', 'CARD', 'FLEET_CARD', 'CREDIT']
const UNITS: UnitOfMeasure[] = ['LITRE', 'KG', 'PIECE']
type Tab = 'products' | 'stockin' | 'sales'

// ── Main page ────────────────────────────────────────────────────────────────

export default function AncillaryProductsPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isManagerOrAbove = isOwnerOrAdmin || user?.role === 'MANAGER'

  const { selectedPumpId } = usePumpStore()
  const [activeTab, setActiveTab] = useState<Tab>('products')

  const pumpId = selectedPumpId

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['ancillaryProducts', pumpId],
    queryFn:  () => ancillaryApi.getProducts(pumpId!),
    enabled:  !!pumpId,
  })


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

      {/* ── Page heading ── */}
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
        <p className="ui-section-kicker">Counter inventory</p>
        <h2 className="ui-title-sm">Products</h2>
        <p className="ui-subtitle">
          Manage lubricants, accessories, and other counter products. Track stock and sales.
        </p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Products</span>
            <span className="ui-section-meta-value">{products.length}</span>
          </div>
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">View</span>
            <span className="ui-section-meta-value">{activeTab === 'products' ? 'Catalog' : activeTab === 'stockin' ? 'Stock In' : 'Sales'}</span>
          </div>
        </div>
      </div>
      </Reveal>

      {!pumpId ? (
        <div className="ui-empty">
          No pump selected. Use the pump selector in the top navigation bar.
        </div>
      ) : (
        <>
          {/* ── Tab bar ── */}
          <Reveal delay={130}>
          <div className="ui-tabbar w-fit">
            {(['products', 'stockin', 'sales'] as Tab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`ui-tabbar__button ${activeTab === tab ? 'ui-tabbar__button--active' : ''}`}
              >
                {tab === 'products' ? 'Products' : tab === 'stockin' ? 'Stock In' : 'Sales History'}
              </button>
            ))}
          </div>
          </Reveal>

          {/* ── Tab content ── */}
          <Reveal delay={200}>
          <div key={activeTab} className="ui-tab-content">
            {activeTab === 'products' && (
              <ProductsTab
                pumpId={pumpId}
                products={products}
                loading={productsLoading}
                isOwnerOrAdmin={isOwnerOrAdmin}
                isManagerOrAbove={isManagerOrAbove}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })}
              />
            )}
            {activeTab === 'stockin' && (
              <StockInTab
                pumpId={pumpId}
                products={products.filter(p => p.status === 'ACTIVE')}
                isManagerOrAbove={isManagerOrAbove}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })}
              />
            )}
            {activeTab === 'sales' && (
              <SalesTab
                pumpId={pumpId}
                products={products}
                isOwnerOrAdmin={isOwnerOrAdmin}
                onRefresh={() => qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })}
              />
            )}
          </div>
          </Reveal>
        </>
      )}
    </div>
  )
}

// ── Products Tab ─────────────────────────────────────────────────────────────

function ProductsTab({
  pumpId, products, loading, isOwnerOrAdmin, isManagerOrAbove, onRefresh,
}: {
  pumpId: number
  products: AncillaryProduct[]
  loading: boolean
  isOwnerOrAdmin: boolean
  isManagerOrAbove: boolean
  onRefresh: () => void
}) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)
  const [productsPage, setProductsPage] = useState(0)
  const [productsPageSize, setProductsPageSize] = useState(10)
  const [sellProduct, setSellProduct] = useState<AncillaryProduct | null>(null)
  const [stockLotsProduct, setStockLotsProduct] = useState<AncillaryProduct | null>(null)

  // Reset to page 0 whenever the deferred search query changes
  useEffect(() => { setProductsPage(0) }, [deferredSearch])

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      ancillaryApi.setProductStatus(pumpId, id, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })
      addToast(status === 'ACTIVE' ? 'Product enabled' : 'Product disabled', 'success')
    },
    onError: (err: any) => addToast(parseApiError(err, 'Failed to update product status'), 'error'),
  })

  const stockBadge = (p: AncillaryProduct) => {
    if (p.lowStockThreshold == null) {
      return <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{p.currentStockUnits} units</span>
    }
    if (p.currentStockUnits <= p.lowStockThreshold) {
      return <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium"><AlertTriangle size={11} strokeWidth={2} />{p.currentStockUnits} units Low</span>
    }
    return <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{p.currentStockUnits} units</span>
  }

  const q = deferredSearch.trim().toLowerCase()
  const filteredProducts = q
    ? products.filter(p =>
        p.displayName.toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        (p.name ?? '').toLowerCase().includes(q)
      )
    : products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (b.currentStockUnits !== a.currentStockUnits) {
      return b.currentStockUnits - a.currentStockUnits
    }
    return a.displayName.localeCompare(b.displayName)
  })

  // Build a client-side PagedResponse from the filtered list
  const totalElements = sortedProducts.length
  const totalPages = Math.max(1, Math.ceil(totalElements / productsPageSize))
  const safePage = Math.min(productsPage, totalPages - 1)
  const pagedProducts = sortedProducts.slice(safePage * productsPageSize, (safePage + 1) * productsPageSize)
  const productsPaged: PagedResponse<AncillaryProduct> = {
    content: pagedProducts,
    page: safePage,
    pageSize: productsPageSize,
    totalElements,
    totalPages,
    hasNext: safePage < totalPages - 1,
    hasPrevious: safePage > 0,
  }

  return (
    <div className="space-y-4">
      {/* Top bar: search + add button */}
      <div className="flex items-center gap-3">
        <div className="ui-search-shell flex-1 max-w-xs">
          <svg className="ui-search-shell__icon" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search products…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ui-search-shell__input w-full text-sm leading-5"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="ui-search-shell__clear"
            >
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </div>
        {isOwnerOrAdmin && (
          <button
            onClick={() => setShowAddForm(true)}
            className="ui-btn ui-btn-primary ml-auto"
          >
            + Add Product
          </button>
        )}
      </div>

      {/* Product grid */}
      {loading ? (
        <div className="py-4"><SkeletonTable rows={3} cols={3} /></div>
      ) : sortedProducts.length === 0 ? (
        <EmptyState
          icon="generic"
          title={deferredSearch ? `No products match "${deferredSearch}"` : 'No products configured yet'}
          subtitle={deferredSearch ? 'Try a different search term.' : 'Add your first product using the button above.'}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {pagedProducts.map(product => (
            <div
              key={product.id}
              className={`ui-card flex h-full flex-col space-y-3 ${
                product.status === 'INACTIVE' ? 'border-slate-200 opacity-60' : 'border-slate-200'
              }`}
            >
              {/* Product header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{product.displayName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{product.unitOfMeasure} · {product.packageSize}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  product.status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {product.status}
                </span>
              </div>

              {/* Stock + buy price row */}
              <div className="flex items-center gap-2 flex-wrap">
                {stockBadge(product)}
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs text-slate-500">
                  {product.fifoCostPricePerUnit != null
                    ? <span>Buy: <span className="font-medium text-slate-700">{fmtCurrency(product.fifoCostPricePerUnit)}/unit</span></span>
                    : <span className="text-slate-400">No stock lot</span>}
                </span>
              </div>

              {/* Action buttons */}
              <div className="mt-auto flex items-center gap-2 pt-3 border-t border-slate-100">
                {/* Sell button — visible to managers and above for active products */}
                {isManagerOrAbove && product.status === 'ACTIVE' && (
                  <button
                    onClick={() => setSellProduct(product)}
                    className="ui-btn ui-btn-primary min-h-0 px-2.5 py-1 text-xs"
                  >
                    Sell
                  </button>
                )}
                {/* Stock Lots button — visible to everyone, shows ACTIVE FIFO lots */}
                <button
                  onClick={() => setStockLotsProduct(product)}
                  className="ui-btn ui-btn-secondary min-h-0 px-2.5 py-1 text-xs"
                >
                  Inventory
                </button>
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => statusMutation.mutate({
                      id: product.id,
                      status: product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                    })}
                    disabled={statusMutation.isPending}
                    className={`ui-btn min-h-0 px-2.5 py-1 text-xs ${
                      product.status === 'ACTIVE'
                        ? 'ui-btn-danger'
                        : 'ui-btn-secondary'
                    }`}
                  >
                    {product.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Products pagination */}
      {!loading && sortedProducts.length > 0 && (
        <Pagination
          data={productsPaged}
          onPageChange={p => setProductsPage(p)}
          onPageSizeChange={s => { setProductsPageSize(s); setProductsPage(0) }}
          pageSizeOptions={[10, 20, 50]}
        />
      )}

      {/* Sell dialog */}
      {showAddForm && (
        <AddProductDialog
          pumpId={pumpId}
          onClose={() => setShowAddForm(false)}
          onSuccess={() => {
            setShowAddForm(false)
            onRefresh()
          }}
        />
      )}

      {sellProduct && (
        <SellDialog
          pumpId={pumpId}
          product={sellProduct}
          onClose={() => setSellProduct(null)}
          onSuccess={() => {
            setSellProduct(null)
            onRefresh()
            qc.invalidateQueries({ queryKey: ['ancillarySales', pumpId] })
          }}
        />
      )}

      {/* Stock Lots dialog */}
      {stockLotsProduct && (
        <StockLotsDialog
          pumpId={pumpId}
          product={stockLotsProduct}
          isOwnerOrAdmin={isOwnerOrAdmin}
          onClose={() => setStockLotsProduct(null)}
          onUpdated={() => {
            onRefresh()
            qc.invalidateQueries({ queryKey: ['ancillaryLots', pumpId, stockLotsProduct.id] })
          }}
        />
      )}
    </div>
  )
}

function AddProductDialog({
  pumpId, onClose, onSuccess,
}: {
  pumpId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const { addToast } = useToastStore()
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<CreateProductRequest>({
    name: '', brand: '', variant: '',
    packageSize: 1, unitOfMeasure: 'PIECE',
  })
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: CreateProductRequest) => ancillaryApi.createProduct(pumpId, data),
    onSuccess: () => {
      addToast('Product created successfully', 'success')
      onSuccess()
    },
    onError: (err: any) => {
      const msg = parseApiError(err, 'Failed to create product')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const normalizedName = form.name.trim()
  const normalizedBrand = form.brand?.trim() || undefined
  const normalizedVariant = form.variant?.trim() || undefined
  const normalizedThreshold = form.lowStockThreshold && form.lowStockThreshold > 0 ? form.lowStockThreshold : undefined

  const validate = () => {
    if (!normalizedName) return 'Product name is required'
    if (!form.packageSize || form.packageSize <= 0) return 'Package size must be greater than 0'
    return null
  }

  const handleReview = () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setStep('review')
  }

  const handleCreate = () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    createMutation.mutate({
      name: normalizedName,
      brand: normalizedBrand,
      variant: normalizedVariant,
      packageSize: form.packageSize,
      unitOfMeasure: form.unitOfMeasure,
      lowStockThreshold: normalizedThreshold,
    })
  }

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop px-4" onClick={onClose}>
      <div className="ui-modal-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">{step === 'form' ? 'Add Product' : 'Review Product'}</h3>
            <p className="ui-modal-subtitle">
              {step === 'form'
                ? 'Create a new counter product with stock alert settings.'
                : 'Review the product details before creating it.'}
            </p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {step === 'form' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error} Go back to modify the data and try again.</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="ui-label">Product Name *</label>
                <input
                  className="text-sm"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Engine Oil"
                  autoFocus
                />
              </div>
              <div>
                <label className="ui-label">Brand</label>
                <input
                  className="text-sm"
                  value={form.brand ?? ''}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="e.g. Castrol"
                />
              </div>
              <div>
                <label className="ui-label">Variant</label>
                <input
                  className="text-sm"
                  value={form.variant ?? ''}
                  onChange={e => setForm(f => ({ ...f, variant: e.target.value }))}
                  placeholder="e.g. GTX 10W-40"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="ui-label">Package Size *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="text-sm"
                    value={form.packageSize}
                    onChange={e => setForm(f => ({ ...f, packageSize: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="w-[132px]">
                  <label className="ui-label">Unit *</label>
                  <SearchableSelect
                    value={form.unitOfMeasure}
                    onChange={v => setForm(f => ({ ...f, unitOfMeasure: v as UnitOfMeasure }))}
                    options={UNITS.map(u => ({ value: u, label: u }))}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="ui-label">Low Stock Alert (units)</label>
                <input
                  type="number"
                  min="0"
                  className="text-sm"
                  value={form.lowStockThreshold ?? ''}
                  onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value ? parseInt(e.target.value) : undefined }))}
                  placeholder="Leave blank to disable"
                />
              </div>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}
            <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
              <ReviewRow label="Product Name" value={normalizedName} />
              <ReviewRow label="Brand" value={normalizedBrand ?? '—'} />
              <ReviewRow label="Variant" value={normalizedVariant ?? '—'} />
              <ReviewRow label="Package Size" value={String(form.packageSize)} />
              <ReviewRow label="Unit" value={form.unitOfMeasure} />
              <ReviewRow label="Low Stock Alert" value={normalizedThreshold != null ? `${normalizedThreshold} units` : 'Disabled'} />
            </div>
          </div>
        )}

        <div className="ui-modal-footer">
          {step === 'form' ? (
            <>
              <button onClick={onClose} className="ui-btn ui-btn-secondary">
                Cancel
              </button>
              <button onClick={handleReview} className="ui-btn ui-btn-primary">
                Review
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('form'); setError(null) }}
                className="ui-btn ui-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {createMutation.isPending
                  ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Creating…</span>
                  : 'Create Product'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Sell Dialog ───────────────────────────────────────────────────────────────
/**
 * Computes the projected total profit for a sale by walking through active FIFO lots
 * in consumption order and computing (sellPrice - costPrice) × consumedQty per batch.
 *
 * This correctly handles multi-batch sales where different lots have different cost prices.
 * Example: lots = [{5 units @ ₹100}, {2 units @ ₹200}], sell 6 @ ₹120
 *   → batch1: (120-100)×5 = 100, batch2: (120-200)×1 = -80 → total = 20
 *   (the old approach of (120-100)×6 = 120 was incorrect)
 *
 * Returns null when lot data is insufficient to cover the requested quantity
 * (e.g. lots were consumed by another sale after the page loaded).
 */
function computeFifoProjectedProfit(
  qty: number,
  sellPricePerUnit: number,
  lots: AncillaryProduct['activeFifoLots'],
): number | null {
  if (!lots || lots.length === 0) return null
  let remaining = qty
  let totalCost = 0
  for (const lot of lots) {
    if (remaining <= 0) break
    const consumed = Math.min(remaining, lot.remainingQuantity)
    totalCost += consumed * lot.costPricePerUnit
    remaining -= consumed
  }
  if (remaining > 0) return null  // insufficient lot data for this quantity
  return qty * sellPricePerUnit - totalCost
}

// 2-step modal: Step 1 = fill form, Step 2 = review & confirm

function SellDialog({
  pumpId, product, onClose, onSuccess,
}: {
  pumpId: number
  product: AncillaryProduct
  onClose: () => void
  onSuccess: () => void
}) {
  const { addToast } = useToastStore()
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<RecordAncillarySaleRequest>({
    productId: product.id,
    quantityUnits: 1,
    sellingPricePerUnit: product.fifoCostPricePerUnit ?? 0,
    paymentMode: 'CASH',
  })
  const [error, setError] = useState<string | null>(null)

  const { data: creditClients = [] } = useQuery({
    queryKey: ['credit-ledger-all', pumpId],
    queryFn: () => creditApi.getLedgerSummary(pumpId),
    enabled: form.paymentMode === 'CREDIT',
  })

  const saleMutation = useMutation({
    mutationFn: (data: RecordAncillarySaleRequest) => ancillaryApi.recordSale(pumpId, data),
    onSuccess: () => {
      addToast('Sale recorded successfully', 'success')
      onSuccess()
    },
    onError: (err: any) => {
      const msg = parseApiError(err, 'Failed to record sale')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const handleProceedToReview = () => {
    if (!form.quantityUnits || form.quantityUnits < 1) { setError('Quantity must be at least 1'); return }
    if (!form.sellingPricePerUnit || form.sellingPricePerUnit <= 0) { setError('Enter a valid selling price greater than 0'); return }
    if (form.paymentMode === 'CREDIT' && !form.clientId) { setError('Please select a client for CREDIT payment'); return }
    setError(null)
    setStep('review')
  }

  const buyPrice   = product.fifoCostPricePerUnit
  const sellPrice  = form.sellingPricePerUnit > 0 ? form.sellingPricePerUnit : null
  const totalAmount = sellPrice != null && form.quantityUnits > 0
    ? sellPrice * form.quantityUnits
    : null

  // Profit/loss indicator: walks FIFO lots in order so multi-batch sales are correct.
  // e.g. sell 6 from lots [5@100, 2@200] @ 120 → (120-100)×5 + (120-200)×1 = 20, not 120.
  const projectedProfit = (sellPrice != null && form.quantityUnits > 0)
    ? computeFifoProjectedProfit(form.quantityUnits, sellPrice, product.activeFifoLots)
    : null
  const marginBadge = projectedProfit == null ? null
    : projectedProfit > 0 ? { label: `Projected profit: +${fmtCurrency(projectedProfit)}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : projectedProfit < 0 ? { label: `Projected loss: ${fmtCurrency(projectedProfit)}`,    cls: 'bg-red-50 text-red-700 border-red-200' }
    :                        { label: 'Break-even',                                          cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  const headerToneClass = projectedProfit == null
    ? 'ui-modal-header--neutral'
    : projectedProfit > 0
      ? 'ui-modal-header--success'
      : projectedProfit < 0
        ? 'ui-modal-header--danger'
        : 'ui-modal-header--neutral'

  const selectedClient = creditClients.find(c => c.id === form.clientId)

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop px-4">
      <div className="ui-modal-panel w-full max-w-md">

        {/* Header */}
        <div className={`ui-modal-header ui-modal-header--themed ${headerToneClass}`}>
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">
              {step === 'form' ? 'Record Sale' : 'Review & Confirm'}
            </h3>
            <p className="ui-modal-subtitle truncate max-w-[280px]">
              {product.displayName}
              {marginBadge ? ` · ${marginBadge.label}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Step 1 — Form */}
        {step === 'form' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}

            {/* Stock + buy price info row */}
            <div className="bg-slate-50 rounded-lg px-4 py-3 flex items-center justify-between text-sm gap-4">
              <div className="flex items-center gap-3">
                <span className="text-slate-500">Stock</span>
                <span className={`font-medium ${
                  product.currentStockUnits <= (product.lowStockThreshold ?? Infinity) ? 'text-red-600' : 'text-slate-800'
                }`}>{product.currentStockUnits} units</span>
              </div>
              {buyPrice != null && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Buy price</span>
                  <span className="font-semibold text-slate-700">{fmtCurrency(buyPrice)}/unit</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">Quantity (units) *</label>
                  <input
                    type="number" min="1" step="1" autoFocus
                    className="text-sm"
                    value={form.quantityUnits}
                    onChange={e => setForm(f => ({ ...f, quantityUnits: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <label className="ui-label">Selling Price (₹/unit) *</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    className="text-sm"
                    value={form.sellingPricePerUnit || ''}
                    onChange={e => setForm(f => ({ ...f, sellingPricePerUnit: parseFloat(e.target.value) || 0 }))}
                    placeholder="MRP"
                  />
                </div>
              </div>

              {/* Profit/loss badge — total projected profit across all FIFO batches */}
              {marginBadge && (
                <div className={`rounded-lg px-4 py-2 border text-xs font-medium ${marginBadge.cls}`}>
                  {marginBadge.label}
                </div>
              )}

              <div>
                <label className="ui-label">Payment Mode *</label>
                <SearchableSelect
                  value={form.paymentMode}
                  onChange={v => setForm(f => ({
                    ...f,
                    paymentMode: v as AncillaryPaymentMode,
                    clientId: v !== 'CREDIT' ? undefined : f.clientId,
                    clientName: v !== 'CREDIT' ? undefined : f.clientName,
                  }))}
                  options={PAYMENT_MODES.map(m => ({ value: m, label: m.replace('_', ' ') }))}
                />
              </div>

              {form.paymentMode === 'CREDIT' && (
                <div>
                  <label className="ui-label">Client * (required for credit)</label>
                  <SearchableSelect
                    value={form.clientId ? form.clientId.toString() : ''}
                    onChange={v => {
                      const client = creditClients.find(c => c.id === parseInt(v))
                      setForm(f => ({ ...f, clientId: client?.id, clientName: client?.name }))
                    }}
                    placeholder="Search client…"
                    options={creditClients.map(c => ({
                      value: c.id.toString(),
                      label: c.name + (c.phone ? ` · ${c.phone}` : ''),
                    }))}
                  />
                </div>
              )}

              <div>
                <label className="ui-label">Bill No</label>
                <input
                  className="text-sm"
                  value={form.billNo ?? ''}
                  onChange={e => setForm(f => ({ ...f, billNo: e.target.value || undefined }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Live total */}
            {totalAmount != null && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-blue-600">Total</span>
                <span className="text-sm font-semibold text-blue-700">{fmtCurrency(totalAmount)}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="ui-btn ui-btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleProceedToReview}
                className="ui-btn ui-btn-primary"
              >
                <span className="inline-flex items-center gap-1.5">Review<ArrowRight size={14} strokeWidth={2} /></span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Review */}
        {step === 'review' && (
          <div className="ui-modal-body space-y-4">
            <p className="text-sm text-slate-500">Please review the details before confirming.</p>

            <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
              <ReviewRow label="Product" value={product.displayName} />
              <ReviewRow label="Quantity" value={`${form.quantityUnits} unit${form.quantityUnits !== 1 ? 's' : ''}`} />
              {buyPrice != null && <ReviewRow label="Buy price / unit" value={fmtCurrency(buyPrice)} />}
              <ReviewRow label="Sell price / unit" value={fmtCurrency(form.sellingPricePerUnit)} />
              <ReviewRow label="Total" value={fmtCurrency(totalAmount)} highlight />
              {marginBadge && (
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-b-xl ${marginBadge.cls}`}>
                  <span className="text-xs">Margin</span>
                  <span className="text-xs font-semibold">{marginBadge.label}</span>
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
              <ReviewRow label="Payment mode" value={form.paymentMode.replace('_', ' ')} />
              {form.paymentMode === 'CREDIT' && selectedClient && (
                <ReviewRow label="Client" value={selectedClient.name} />
              )}
              {form.billNo && <ReviewRow label="Bill No" value={form.billNo} />}
            </div>

            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}

            <div className="flex justify-between gap-2 pt-1">
              <button
                onClick={() => { setStep('form'); setError(null) }}
                className="ui-btn ui-btn-secondary"
              >
                <span className="inline-flex items-center gap-1.5"><ChevronLeft size={14} strokeWidth={2} />Back</span>
              </button>
              <button
                onClick={() => saleMutation.mutate(form)}
                disabled={saleMutation.isPending}
                className="ui-btn ui-btn-primary disabled:opacity-50"
              >
                {saleMutation.isPending
                  ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Recording…</span>
                  : 'Confirm Sale'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </ModalPortal>
  )
}

function ReviewRow({ label, value, highlight = false }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`font-medium text-sm ${highlight ? 'text-blue-700' : 'text-slate-800'}`}>{value ?? '—'}</span>
    </div>
  )
}

// ── Stock Lots Dialog ─────────────────────────────────────────────────────────
/**
 * Shows all ACTIVE FIFO lots for a product in consumption order (oldest first).
 * Each row shows: In Date, Bill No, Cost Price/unit, Remaining, Original.
 * Owner/Admin can edit remaining quantity and cost price inline per row.
 * Editing remaining quantity automatically adjusts product.currentStockUnits on the backend.
 */
function StockLotsDialog({
  pumpId, product, isOwnerOrAdmin, onClose, onUpdated,
}: {
  pumpId: number
  product: AncillaryProduct
  isOwnerOrAdmin: boolean
  onClose: () => void
  onUpdated: () => void
}) {
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const [editingLotId, setEditingLotId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<{ costPricePerUnit: string; remainingQuantity: string }>({
    costPricePerUnit: '',
    remainingQuantity: '',
  })
  const [editError, setEditError] = useState<string | null>(null)

  const { data: lots = [], isLoading } = useQuery<AncillaryLotDetail[]>({
    queryKey: ['ancillaryLots', pumpId, product.id],
    queryFn:  () => ancillaryApi.getLots(pumpId, product.id),
  })

  const updateMutation = useMutation({
    mutationFn: ({ lotId, data }: { lotId: number; data: UpdateLotRequest }) =>
      ancillaryApi.updateLot(pumpId, lotId, data),
    onSuccess: () => {
      setEditingLotId(null)
      setEditError(null)
      qc.invalidateQueries({ queryKey: ['ancillaryLots', pumpId, product.id] })
      addToast('Lot updated successfully', 'success')
      onUpdated()
    },
    onError: (err: any) => {
      const msg = parseApiError(err, 'Failed to update lot')
      setEditError(msg)
      addToast(msg, 'error')
    },
  })

  const startEdit = (lot: AncillaryLotDetail) => {
    setEditingLotId(lot.id)
    setEditForm({
      costPricePerUnit: lot.costPricePerUnit.toString(),
      remainingQuantity: lot.remainingQuantity.toString(),
    })
    setEditError(null)
  }

  const handleSave = (lot: AncillaryLotDetail) => {
    const newCost = parseFloat(editForm.costPricePerUnit)
    const newQty  = parseInt(editForm.remainingQuantity, 10)
    if (isNaN(newCost) || newCost <= 0) { setEditError('Cost price must be greater than 0'); return }
    if (isNaN(newQty)  || newQty  <  0) { setEditError('Remaining quantity cannot be negative'); return }
    if (newQty > lot.originalQuantity)  { setEditError(`Remaining quantity cannot exceed original (${lot.originalQuantity})`); return }

    const payload: UpdateLotRequest = {}
    if (newCost !== lot.costPricePerUnit)  payload.costPricePerUnit  = newCost
    if (newQty  !== lot.remainingQuantity) payload.remainingQuantity = newQty
    if (Object.keys(payload).length === 0) { setEditingLotId(null); return }

    updateMutation.mutate({ lotId: lot.id, data: payload })
  }

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop">
      <div className="ui-modal-panel ui-modal-panel--lg w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info shrink-0">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">Stock Lots</h3>
            <p className="ui-modal-subtitle truncate max-w-[380px]">{product.displayName}</p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Body */}
        <div className="ui-modal-body overflow-auto flex-1">
          {isLoading ? (
            <p className="ui-empty py-8">Loading lots…</p>
          ) : lots.length === 0 ? (
            <p className="ui-empty py-8">No active stock lots. Record a stock delivery first.</p>
          ) : (
            <>
              {editError && (
                <div className="ui-alert ui-alert-danger mb-3 text-sm">{editError}</div>
              )}
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200">
                    <th className="text-left pb-2 pr-4 font-medium">In Date</th>
                    <th className="text-left pb-2 pr-4 font-medium">Bill No</th>
                    <th className="text-right pb-2 pr-4 font-medium">Cost Price/Unit</th>
                    <th className="text-right pb-2 pr-4 font-medium">Remaining</th>
                    <th className="text-right pb-2 pr-4 font-medium">Original</th>
                    {isOwnerOrAdmin && <th className="text-right pb-2 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lots.map((lot, idx) => (
                    <tr key={lot.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      {editingLotId === lot.id ? (
                        <>
                          <td className="py-2.5 pr-4 text-slate-700">{fmtDate(lot.deliveryDate)}</td>
                          <td className="py-2.5 pr-4 text-slate-500">{lot.invoiceReference ?? '—'}</td>
                          <td className="py-2.5 pr-4 text-right">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={editForm.costPricePerUnit}
                              onChange={e => setEditForm(f => ({ ...f, costPricePerUnit: e.target.value }))}
                              className="w-24 text-right text-sm"
                            />
                          </td>
                          <td className="py-2.5 pr-4 text-right">
                            <input
                              type="number"
                              min="0"
                              max={lot.originalQuantity}
                              step="1"
                              value={editForm.remainingQuantity}
                              onChange={e => setEditForm(f => ({ ...f, remainingQuantity: e.target.value }))}
                              className="w-20 text-right text-sm"
                            />
                          </td>
                          <td className="py-2.5 pr-4 text-right text-slate-500">{lot.originalQuantity}</td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleSave(lot)}
                                disabled={updateMutation.isPending}
                              className="ui-btn ui-btn-primary min-h-0 px-3 py-1 text-xs disabled:opacity-50"
                              >
                                {updateMutation.isPending ? <span className="flex items-center gap-1"><Spinner className="w-3 h-3" />Saving…</span> : 'Save'}
                              </button>
                              <button
                                onClick={() => { setEditingLotId(null); setEditError(null) }}
                                className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 pr-4 text-slate-700">{fmtDate(lot.deliveryDate)}</td>
                          <td className="py-2.5 pr-4 text-slate-500">{lot.invoiceReference ?? '—'}</td>
                          <td className="py-2.5 pr-4 text-right font-medium text-slate-800">{fmtCurrency(lot.costPricePerUnit)}</td>
                          <td className="py-2.5 pr-4 text-right">
                            <span className="font-semibold text-emerald-700">{lot.remainingQuantity}</span>
                          </td>
                          <td className="py-2.5 pr-4 text-right text-slate-500">{lot.originalQuantity}</td>
                          {isOwnerOrAdmin && (
                            <td className="py-2.5 text-right">
                              <button
                                onClick={() => startEdit(lot)}
                              className="ui-btn ui-btn-ghost min-h-0 px-0 py-0 text-xs text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
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

// ── Stock In Tab ─────────────────────────────────────────────────────────────

function StockInTab({
  pumpId, products, isManagerOrAbove, onRefresh,
}: {
  pumpId: number
  products: AncillaryProduct[]
  isManagerOrAbove: boolean
  onRefresh: () => void
}) {
  const qc = useQueryClient()
  const [deliveryPage, setDeliveryPage] = useState(0)
  const [deliveryPageSize, setDeliveryPageSize] = useState(10)
  const [stockInOpen, setStockInOpen] = useState(false)
  const productMap = new Map(products.map((product) => [product.id, product]))

  const { data: deliveriesPage } = useQuery({
    queryKey: ['ancillaryDeliveries', pumpId, deliveryPage, deliveryPageSize],
    queryFn:  () => ancillaryApi.getDeliveries(pumpId, deliveryPage, deliveryPageSize),
  })
  const deliveries = deliveriesPage?.content ?? []

  return (
    <div className="space-y-5">
      {/* Stock-in form */}
      {isManagerOrAbove ? (
        <div className="flex justify-end">
          <button
            onClick={() => setStockInOpen(true)}
            className="ui-btn ui-btn-primary"
          >
            Record Stock Delivery
          </button>
        </div>
      ) : (
        <div className="ui-alert ui-alert-warning text-sm">
          Only Managers, Admins, and Owners can record deliveries.
        </div>
      )}

      {stockInOpen && (
        <StockInDialog
          pumpId={pumpId}
          products={products}
          onClose={() => setStockInOpen(false)}
          onSuccess={() => {
            setStockInOpen(false)
            setDeliveryPage(0)
            qc.invalidateQueries({ queryKey: ['ancillaryDeliveries', pumpId] })
            onRefresh()
          }}
        />
      )}

      {/* Delivery history */}
      <div className="ui-card p-0">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Recent Deliveries</h3>
        </div>
        {deliveries.length === 0 ? (
          <EmptyState icon="generic" title="No deliveries recorded yet" subtitle="Record stock deliveries using the button above." />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 uppercase border-b border-slate-100">
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Product</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3 text-right">Cost/Unit</th>
                  <th className="px-5 py-3 text-right">Total Cost</th>
                  <th className="px-5 py-3 text-left">Invoice</th>
                  <th className="px-5 py-3 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map(d => {
                  const product = productMap.get(d.productId)
                  return (
                  <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-600">{fmtDate(d.deliveryDate)}</td>
                    <td className="px-5 py-3 text-slate-600">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700">{product?.displayName ?? `Product #${d.productId}`}</span>
                        <span className="text-xs text-slate-400">#{d.productId}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-medium">{d.quantityUnits}</td>
                    <td className="px-5 py-3 text-right">{fmtCurrency(d.costPricePerUnit)}</td>
                    <td className="px-5 py-3 text-right font-medium">
                      {fmtCurrency(d.costPricePerUnit * d.quantityUnits)}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{d.invoiceReference ?? '—'}</td>
                    <td className="px-5 py-3">
                      {d.isBackfilled && (
                        <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                          Backfilled
                        </span>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
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
        )}
      </div>
    </div>
  )
}

function StockInDialog({
  pumpId, products, onClose, onSuccess,
}: {
  pumpId: number
  products: AncillaryProduct[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { addToast } = useToastStore()
  const today = localDateInputValue()
  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<RecordStockDeliveryRequest & { productId: number | '' }>({
    productId: products[0]?.id ?? '',
    quantityUnits: 1,
    costPricePerUnit: 0,
    deliveryDate: today,
    invoiceReference: '',
  })
  const [error, setError] = useState<string | null>(null)

  const deliveryMutation = useMutation({
    mutationFn: (data: { productId: number; req: RecordStockDeliveryRequest }) =>
      ancillaryApi.recordDelivery(pumpId, data.productId, data.req),
    onSuccess: () => {
      addToast('Stock delivery recorded successfully', 'success')
      onSuccess()
    },
    onError: (err: any) => {
      const msg = parseApiError(err, 'Failed to record delivery')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const selectedProduct = products.find(p => p.id === form.productId) ?? null
  const totalCost = form.quantityUnits > 0 && form.costPricePerUnit > 0
    ? form.quantityUnits * form.costPricePerUnit
    : null

  const validate = () => {
    if (!form.productId) return 'Select a product'
    if (!form.quantityUnits || form.quantityUnits < 1) return 'Quantity must be at least 1'
    if (!form.costPricePerUnit || form.costPricePerUnit <= 0) return 'Enter a valid cost price'
    if (!form.deliveryDate) return 'Delivery date is required'
    return null
  }

  const handleReview = () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setStep('review')
  }

  const handleSubmit = () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    deliveryMutation.mutate({
      productId: form.productId as number,
      req: {
        quantityUnits: form.quantityUnits,
        costPricePerUnit: form.costPricePerUnit,
        deliveryDate: form.deliveryDate,
        invoiceReference: form.invoiceReference?.trim() || undefined,
      },
    })
  }

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop px-4" onClick={onClose}>
      <div className="ui-modal-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">{step === 'form' ? 'Record Stock Delivery' : 'Review Stock Delivery'}</h3>
            <p className="ui-modal-subtitle">
              {step === 'form'
                ? 'Capture incoming stock with cost and bill details.'
                : 'Review the stock delivery before submitting it.'}
            </p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {step === 'form' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error} Go back to modify the data and try again.</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="ui-label">Product *</label>
                <SearchableSelect
                  value={form.productId ? form.productId.toString() : ''}
                  onChange={v => setForm(f => ({ ...f, productId: v ? parseInt(v) : '' }))}
                  placeholder="Select product…"
                  options={products.map(p => ({ value: p.id.toString(), label: `${p.displayName} (stock: ${p.currentStockUnits})` }))}
                />
              </div>
              <div>
                <label className="ui-label">Quantity (units) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="text-sm"
                  value={form.quantityUnits}
                  onChange={e => setForm(f => ({ ...f, quantityUnits: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <label className="ui-label">Cost Price per Unit (₹) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="text-sm"
                  value={form.costPricePerUnit || ''}
                  onChange={e => setForm(f => ({ ...f, costPricePerUnit: parseFloat(e.target.value) || 0 }))}
                  placeholder="₹"
                />
              </div>
              <div>
                <label className="ui-label">Delivery Date *</label>
                <input
                  type="date"
                  className="text-sm"
                  value={form.deliveryDate}
                  onChange={e => setForm(f => ({ ...f, deliveryDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="ui-label">Invoice Reference</label>
                <input
                  className="text-sm"
                  value={form.invoiceReference ?? ''}
                  onChange={e => setForm(f => ({ ...f, invoiceReference: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            {totalCost != null && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-blue-600">Estimated Total</span>
                <span className="text-sm font-semibold text-blue-700">{fmtCurrency(totalCost)}</span>
              </div>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error} Go back to modify the data and try again.</div>
            )}
            <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
              <ReviewRow label="Product" value={selectedProduct?.displayName ?? '—'} />
              <ReviewRow label="Quantity" value={`${form.quantityUnits} unit${form.quantityUnits !== 1 ? 's' : ''}`} />
              <ReviewRow label="Cost Price / Unit" value={fmtCurrency(form.costPricePerUnit)} />
              <ReviewRow label="Delivery Date" value={fmtDate(form.deliveryDate)} />
              <ReviewRow label="Invoice Reference" value={form.invoiceReference?.trim() || '—'} />
              <ReviewRow label="Total Cost" value={fmtCurrency(totalCost)} highlight />
            </div>
          </div>
        )}

        <div className="ui-modal-footer">
          {step === 'form' ? (
            <>
              <button onClick={onClose} className="ui-btn ui-btn-secondary">
                Cancel
              </button>
              <button onClick={handleReview} className="ui-btn ui-btn-primary">
                Review
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('form'); setError(null) }}
                className="ui-btn ui-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={deliveryMutation.isPending}
                className="ui-btn ui-btn-primary"
              >
                {deliveryMutation.isPending ? <span className="flex items-center gap-1.5"><Spinner />Recording…</span> : 'Confirm Delivery'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── Sales History Tab ─────────────────────────────────────────────────────────

function SalesTab({
  pumpId,
  products,
  isOwnerOrAdmin,
  onRefresh,
}: {
  pumpId: number
  products: AncillaryProduct[]
  isOwnerOrAdmin: boolean
  onRefresh: () => void
}) {
  const qc = useQueryClient()
  const [salesPage, setSalesPage] = useState(0)
  const [salesPageSize, setSalesPageSize] = useState(10)
  const [backfillOpen, setBackfillOpen] = useState(false)

  const { data: salesPageData } = useQuery({
    queryKey: ['ancillarySales', pumpId, salesPage, salesPageSize],
    queryFn:  () => ancillaryApi.getSales(pumpId, salesPage, salesPageSize),
  })
  const sales = salesPageData?.content ?? []

  const modeColor: Record<string, string> = {
    CASH: 'bg-emerald-100 text-emerald-700',
    UPI: 'bg-blue-100 text-blue-700',
    CARD: 'bg-purple-100 text-purple-700',
    FLEET_CARD: 'bg-amber-100 text-amber-700',
    CREDIT: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-4">
      {/* Backfill button — Admin/Owner only */}
      {isOwnerOrAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setBackfillOpen(true)}
            className="ui-btn ui-btn-secondary"
          >
            Backfill Sale
          </button>
        </div>
      )}

      <div className="ui-card p-0">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Sales History</h3>
        </div>
        {sales.length === 0 ? (
          <EmptyState icon="transactions" title="No sales recorded yet" subtitle="Sales will appear here after you record them." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase border-b border-slate-100">
                    <th className="px-5 py-3 text-left">Date</th>
                    <th className="px-5 py-3 text-left">Product</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                    <th className="px-5 py-3 text-right">Price/Unit</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-left">Mode</th>
                    <th className="px-5 py-3 text-left">Client</th>
                    <th className="px-5 py-3 text-left">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => (
                    <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{fmtDate(s.saleDate)}</td>
                      <td className="px-5 py-3 text-slate-700 font-medium max-w-[180px] truncate">{s.productDisplayName}</td>
                      <td className="px-5 py-3 text-right">{s.quantityUnits}</td>
                      <td className="px-5 py-3 text-right text-slate-500">{fmtCurrency(s.sellingPricePerUnit)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">{fmtCurrency(s.totalAmount)}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${modeColor[s.paymentMode] ?? 'bg-slate-100 text-slate-600'}`}>
                          {s.paymentMode.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-400">{s.clientName ?? '—'}</td>
                      <td className="px-5 py-3">
                        {s.isBackfilled && (
                          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                            Backfilled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {salesPageData && (
              <div className="px-5">
                <Pagination
                  data={salesPageData}
                  onPageChange={p => { setSalesPage(p); qc.invalidateQueries({ queryKey: ['ancillarySales', pumpId] }) }}
                  onPageSizeChange={s => { setSalesPageSize(s); setSalesPage(0) }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {backfillOpen && (
        <BackfillSaleModal
          pumpId={pumpId}
          products={products.filter(p => p.status === 'ACTIVE')}
          onClose={() => setBackfillOpen(false)}
          onSuccess={() => {
            setBackfillOpen(false)
            setSalesPage(0)
            qc.invalidateQueries({ queryKey: ['ancillarySales', pumpId] })
            qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

// ── Backfill Sale Modal ───────────────────────────────────────────────────────
/**
 * 2-step modal for Admin/Owner to retroactively record a historical counter sale.
 *
 * Key differences from the live SellDialog:
 * - Requires a past date (saleDate strictly before today).
 * - The selling price is NOT entered by the user — the backend resolves it from
 *   the product's price history for the chosen date.
 * - FIFO deduction is restricted to lots delivered on or before saleDate.
 * - Before recording a sale for a date, the product must have a historical stock
 *   delivery on or before that date (enforce this via the Stock In tab first).
 */
function BackfillSaleModal({
  pumpId, products, onClose, onSuccess,
}: {
  pumpId: number
  products: AncillaryProduct[]
  onClose: () => void
  onSuccess: () => void
}) {
  useEscapeKey(onClose)
  const { addToast } = useToastStore()
  const yesterday = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })()

  const [step, setStep] = useState<'form' | 'review'>('form')
  const [form, setForm] = useState<BackfillSaleRequest>({
    productId: products[0]?.id ?? 0,
    saleDate: yesterday,
    quantityUnits: 1,
    paymentMode: 'CASH',
  })
  const [error, setError] = useState<string | null>(null)

  const backfillMutation = useMutation({
    mutationFn: (data: BackfillSaleRequest) => ancillaryApi.backfillSale(pumpId, data),
    onSuccess: () => {
      addToast('Historical sale backfilled successfully', 'success')
      onSuccess()
    },
    onError: (err: any) => {
      const msg = parseApiError(err, 'Failed to backfill sale')
      setError(msg)
      addToast(msg, 'error')
    },
  })

  const selectedProduct = products.find(p => p.id === form.productId) ?? null

  const validate = (): string | null => {
    if (!form.productId) return 'Select a product'
    if (!form.saleDate) return 'Sale date is required'
    if (form.saleDate >= new Date().toISOString().split('T')[0]) {
      return 'Sale date must be before today. Use the Sell button on the Products tab for today\'s sales.'
    }
    if (!form.quantityUnits || form.quantityUnits < 1) return 'Quantity must be at least 1'
    if (form.paymentMode === 'CREDIT' && !form.clientName?.trim()) {
      return 'Client name is required for CREDIT payment mode'
    }
    return null
  }

  const handleReview = () => {
    const err = validate()
    if (err) { setError(err); return }
    setError(null)
    setStep('review')
  }

  return (
    <ModalPortal>
    <div className="ui-modal-backdrop px-4" onClick={onClose}>
      <div className="ui-modal-panel w-full max-w-md" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ui-modal-header ui-modal-header--themed ui-modal-header--info">
          <div className="ui-modal-heading">
            <h3 className="ui-modal-title">
              {step === 'form' ? 'Backfill Sale' : 'Review Backfill Sale'}
            </h3>
            <p className="ui-modal-subtitle">
              {step === 'form'
                ? 'Enter a historical counter sale. Price is resolved from price history.'
                : 'Review the details before submitting.'}
            </p>
          </div>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-modal-close"><X size={16} strokeWidth={2} /></button>
        </div>

        {/* Step 1 — Form */}
        {step === 'form' && (
          <div className="ui-modal-body space-y-4">
            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}

            {/* Info banner about price resolution */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700">
              <strong>Note:</strong> The selling price will be automatically resolved from the product's
              price history for the selected date. Make sure a price was set on or before that date.
              Stock must also have been delivered on or before the sale date.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="ui-label">Product *</label>
                <SearchableSelect
                  value={form.productId ? form.productId.toString() : ''}
                  onChange={v => setForm(f => ({ ...f, productId: v ? parseInt(v) : 0 }))}
                  placeholder="Select product…"
                  options={products.map(p => ({ value: p.id.toString(), label: `${p.displayName} (stock: ${p.currentStockUnits})` }))}
                />
              </div>

              <div>
                <label className="ui-label">Sale Date * (past only)</label>
                <input
                  type="date"
                  className="text-sm"
                  value={form.saleDate}
                  max={yesterday}
                  onChange={e => setForm(f => ({ ...f, saleDate: e.target.value }))}
                />
              </div>

              <div>
                <label className="ui-label">Quantity (units) *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="text-sm"
                  value={form.quantityUnits}
                  onChange={e => setForm(f => ({ ...f, quantityUnits: parseInt(e.target.value) || 0 }))}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="ui-label">Payment Mode *</label>
                <SearchableSelect
                  value={form.paymentMode}
                  onChange={v => setForm(f => ({
                    ...f,
                    paymentMode: v as AncillaryPaymentMode,
                    clientName: v !== 'CREDIT' ? undefined : f.clientName,
                  }))}
                  options={PAYMENT_MODES.map(m => ({ value: m, label: m.replace('_', ' ') }))}
                />
              </div>

              {form.paymentMode === 'CREDIT' && (
                <div className="sm:col-span-2">
                  <label className="ui-label">Client Name * (required for credit)</label>
                  <input
                    className="text-sm"
                    value={form.clientName ?? ''}
                    onChange={e => setForm(f => ({ ...f, clientName: e.target.value || undefined }))}
                    placeholder="Enter client name"
                  />
                </div>
              )}

              <div>
                <label className="ui-label">Bill No</label>
                <input
                  className="text-sm"
                  value={form.billNo ?? ''}
                  onChange={e => setForm(f => ({ ...f, billNo: e.target.value || undefined }))}
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="ui-label">Notes</label>
                <input
                  className="text-sm"
                  value={form.notes ?? ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value || undefined }))}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Review */}
        {step === 'review' && (
          <div className="ui-modal-body space-y-4">
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5 text-xs text-violet-700 font-medium">
              This sale will be recorded as <strong>Backfilled</strong> for {fmtDate(form.saleDate)}.
              The selling price is resolved from price history.
            </div>

            <div className="ui-card-plain ui-card-muted divide-y divide-slate-100 overflow-hidden text-sm">
              <ReviewRow label="Product" value={selectedProduct?.displayName ?? '—'} />
              <ReviewRow label="Sale Date" value={fmtDate(form.saleDate)} />
              <ReviewRow label="Quantity" value={`${form.quantityUnits} unit${form.quantityUnits !== 1 ? 's' : ''}`} />
              <ReviewRow label="Payment Mode" value={form.paymentMode.replace('_', ' ')} />
              {form.paymentMode === 'CREDIT' && <ReviewRow label="Client" value={form.clientName ?? '—'} />}
              {form.billNo && <ReviewRow label="Bill No" value={form.billNo} />}
              {form.notes && <ReviewRow label="Notes" value={form.notes} />}
              <ReviewRow label="Price" value="Resolved from price history" />
            </div>

            {error && (
              <div className="ui-alert ui-alert-danger text-sm">{error}</div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="ui-modal-footer">
          {step === 'form' ? (
            <>
              <button onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
              <button onClick={handleReview} className="ui-btn ui-btn-primary">Review →</button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('form'); setError(null) }}
                className="ui-btn ui-btn-secondary"
              >
                <span className="inline-flex items-center gap-1.5"><ChevronLeft size={14} strokeWidth={2} />Back</span>
              </button>
              <button
                onClick={() => backfillMutation.mutate(form)}
                disabled={backfillMutation.isPending}
                className="ui-btn ui-btn-primary disabled:opacity-50"
              >
                {backfillMutation.isPending
                  ? <span className="flex items-center gap-1.5"><Spinner className="w-4 h-4" />Recording…</span>
                  : 'Confirm Backfill'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
