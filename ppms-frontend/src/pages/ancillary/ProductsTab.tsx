import { useState, useDeferredValue } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertTriangle } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import { useOnValuesChange } from '../../hooks/useOnValuesChange'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { Pagination } from '../../components/Pagination'
import type { PagedResponse } from '../../types/paged'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { IconButton } from '../../components/IconButton'
import { AddProductDialog } from './AddProductDialog'
import { SellDialog } from './SellDialog'
import { StockLotsDialog } from './StockLotsDialog'
import { fmtCurrency } from './ancillaryFormat'
import { useAuthStore } from '../../store/authStore'
import { canPerformAction } from '../../permissions/permissions'
import { codeLabel } from '../../constants/labels'

// ── Products Tab ─────────────────────────────────────────────────────────────

export function ProductsTab({
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
  const canSell = canPerformAction('product:record-sale', useAuthStore((state) => state.user?.role))
  const [showAddForm, setShowAddForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)
  const [productsPage, setProductsPage] = useState(0)
  const [productsPageSize, setProductsPageSize] = useState(10)
  const [sellProduct, setSellProduct] = useState<AncillaryProduct | null>(null)
  const [stockLotsProduct, setStockLotsProduct] = useState<AncillaryProduct | null>(null)

  useOnValuesChange([deferredSearch], () => setProductsPage(0))

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      ancillaryApi.setProductStatus(pumpId, id, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })
      addToast(status === 'ACTIVE' ? 'Product enabled' : 'Product disabled', 'success')
    },
    onError: (err) => addToast(parseApiError(err, 'Failed to update product status'), 'error'),
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
          <input aria-label="Search products"
            type="text"
            placeholder="Search products…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ui-search-shell__input w-full text-sm leading-5"
          />
          {searchQuery && (
            <IconButton
              onClick={() => setSearchQuery('')}
              className="ui-search-shell__clear"
              label="Clear search"
              icon={<X size={13} strokeWidth={2} />}
            />
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
                  <p className="text-xs text-slate-500 mt-0.5">{product.unitOfMeasure} · {product.packageSize}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                  product.status === 'ACTIVE'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {codeLabel(product.status)}
                </span>
              </div>

              {/* Stock + buy price row */}
              <div className="flex items-center gap-2 flex-wrap">
                {stockBadge(product)}
                {isManagerOrAbove && (
                  <>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs text-slate-500">
                      {product.fifoCostPricePerUnit != null
                        ? <span>Buy: <span className="font-medium text-slate-700">{fmtCurrency(product.fifoCostPricePerUnit)}/unit</span></span>
                        : <span className="text-slate-500">No stock lot</span>}
                    </span>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-auto flex items-center gap-2 pt-3 border-t border-slate-100">
                {canSell && product.status === 'ACTIVE' && (
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
