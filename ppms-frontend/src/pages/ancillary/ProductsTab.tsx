import { useState, useDeferredValue } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertTriangle, Check, Package, PackageCheck, Pause } from 'lucide-react'
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
import { StatusBadge } from '../../components/StatusBadge'
import { AddProductDialog } from './AddProductDialog'
import { SellDialog } from './SellDialog'
import { StockLotsPanel } from './StockLotsPanel'
import { EditHsnDialog } from './EditHsnDialog'
import { fmtCurrency } from './ancillaryFormat'
import { useAuthStore } from '../../store/authStore'
import { canPerformAction } from '../../permissions/permissions'
import { codeLabel } from '../../constants/labels'
import { PageSection } from '../../components/layout/PageSection'
import { FilterBar } from '../../components/layout/FilterBar'

export function ProductsTab({
  pumpId, products, loading, isOwnerOrAdmin, isManagerOrAbove, isAddingProduct, onAddProductClosed, onRefresh,
}: {
  pumpId: number
  products: AncillaryProduct[]
  loading: boolean
  isOwnerOrAdmin: boolean
  isManagerOrAbove: boolean
  isAddingProduct: boolean
  onAddProductClosed: () => void
  onRefresh: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const qc = useQueryClient()
  const { addToast } = useToastStore()
  const canSell = canPerformAction('product:record-sale', useAuthStore((state) => state.user?.role))
  const [searchQuery, setSearchQuery] = useState('')
  const deferredSearch = useDeferredValue(searchQuery)
  const [productsPage, setProductsPage] = useState(0)
  const [productsPageSize, setProductsPageSize] = useState(10)
  const [sellProduct, setSellProduct] = useState<AncillaryProduct | null>(null)
  const [stockLotsProduct, setStockLotsProduct] = useState<AncillaryProduct | null>(null)
  const [hsnProduct, setHsnProduct] = useState<AncillaryProduct | null>(null)

  useOnValuesChange([deferredSearch], () => setProductsPage(0))

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'ACTIVE' | 'INACTIVE' }) =>
      ancillaryApi.setProductStatus(pumpId, id, status),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })
      addToast(status === 'ACTIVE' ? t('products.enabled') : t('products.disabled'), 'success')
    },
    onError: (err) => addToast(parseApiError(err, t('products.statusFailed')), 'error'),
  })

  const stockBadge = (p: AncillaryProduct) => {
    if (p.lowStockThreshold == null) {
      return <StatusBadge tone="neutral" icon={Package} label={t('products.stockUnits', { value: p.currentStockUnits })} />
    }
    if (p.currentStockUnits <= p.lowStockThreshold) {
      return <StatusBadge tone="bad" icon={AlertTriangle} label={t('products.stockLow', { value: p.currentStockUnits })} />
    }
    return <StatusBadge tone="ok" icon={PackageCheck} label={t('products.stockUnits', { value: p.currentStockUnits })} />
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
    <PageSection title={t('tabs.products')} flush>
      <FilterBar
        label={t('products.filtersLabel')}
        summary={deferredSearch ? t('products.matchCount', { count: totalElements }) : undefined}
      >
        <div className="ui-search-shell w-full sm:w-72">
          <svg className="ui-search-shell__icon" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input aria-label={t('products.searchLabel')}
            type="text"
            placeholder={t('products.searchPlaceholder')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="ui-search-shell__input w-full text-sm leading-5"
          />
          {searchQuery && (
            <IconButton
              onClick={() => setSearchQuery('')}
              className="ui-search-shell__clear"
              label={t('products.clearSearch')}
              icon={<X size={13} strokeWidth={2} />}
            />
          )}
        </div>
      </FilterBar>

      <div className="p-(--density-card-pad)">
        {loading ? (
          <div className="py-4"><SkeletonTable rows={3} cols={3} /></div>
        ) : sortedProducts.length === 0 ? (
          <EmptyState
            icon="generic"
            title={deferredSearch ? t('products.noMatchTitle', { query: deferredSearch }) : t('products.emptyTitle')}
            subtitle={deferredSearch ? t('products.noMatchSubtitle') : t('products.emptySubtitle')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-(--density-gap) sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pagedProducts.map(product => (
              <div
                key={product.id}
                className={`ui-card flex h-full flex-col space-y-3 ${
                  product.status === 'INACTIVE' ? 'border-border opacity-60' : 'border-border'
                }`}
              >
                {/* Product header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink leading-tight">{product.displayName}</p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {t(`units.${product.unitOfMeasure}`)} · {product.packageSize}{product.hsnCode ? ` · ${t('products.hsn', { code: product.hsnCode })}` : ''}
                    </p>
                  </div>
                  <StatusBadge
                    tone={product.status === 'ACTIVE' ? 'ok' : 'neutral'}
                    icon={product.status === 'ACTIVE' ? Check : Pause}
                    label={codeLabel(product.status)}
                    className="shrink-0"
                  />
                </div>

                {/* Stock + buy price row */}
                <div className="flex items-center gap-2 flex-wrap">
                  {stockBadge(product)}
                  {isManagerOrAbove && (
                    <>
                      <span className="text-xs text-ink-3">·</span>
                      <span className="text-xs text-ink-3">
                        {product.fifoCostPricePerUnit != null
                          ? <span><Trans t={t} i18nKey="products.buyPrice" values={{ price: fmtCurrency(product.fifoCostPricePerUnit) }}
                              components={{ price: <span className="font-medium text-ink" /> }} /></span>
                          : <span className="text-ink-3">{t('products.noStockLot')}</span>}
                      </span>
                    </>
                  )}
                </div>

                {/* Action buttons */}
                <div className="mt-auto flex items-center gap-2 pt-3 border-t border-border">
                  {canSell && product.status === 'ACTIVE' && (
                    <button
                      onClick={() => setSellProduct(product)}
                      className="ui-btn ui-btn-primary min-h-0 px-2.5 py-1 text-xs"
                    >
                      {t('products.sell')}
                    </button>
                  )}
                  <button
                    onClick={() => setStockLotsProduct(product)}
                    className="ui-btn ui-btn-secondary min-h-0 px-2.5 py-1 text-xs"
                  >
                    {t('products.inventory')}
                  </button>
                  {isOwnerOrAdmin && (
                    <button
                      type="button"
                      onClick={() => setHsnProduct(product)}
                      className="ui-btn ui-btn-secondary min-h-0 px-2.5 py-1 text-xs"
                      aria-label={t('products.editHsnOf', { name: product.displayName })}
                    >
                      HSN
                    </button>
                  )}
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
                      {product.status === 'ACTIVE' ? t('common:actions.disable') : t('common:actions.enable')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && sortedProducts.length > 0 && (
          <Pagination
            data={productsPaged}
            onPageChange={p => setProductsPage(p)}
            onPageSizeChange={s => { setProductsPageSize(s); setProductsPage(0) }}
            pageSizeOptions={[10, 20, 50]}
          />
        )}
      </div>

      {isAddingProduct && (
        <AddProductDialog
          pumpId={pumpId}
          onClose={onAddProductClosed}
          onSuccess={() => {
            onAddProductClosed()
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

      {hsnProduct && (
        <EditHsnDialog
          pumpId={pumpId}
          product={hsnProduct}
          onClose={() => setHsnProduct(null)}
          onSuccess={() => {
            setHsnProduct(null)
            onRefresh()
          }}
        />
      )}

      {stockLotsProduct && (
        <StockLotsPanel
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
    </PageSection>
  )
}
