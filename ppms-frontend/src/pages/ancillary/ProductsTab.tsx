import { useState, useDeferredValue } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { useOnValuesChange } from '../../hooks/useOnValuesChange'
import { Pagination } from '../../components/Pagination'
import type { PagedResponse } from '../../types/paged'
import { SkeletonTable } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { useAuthStore } from '../../store/authStore'
import { canPerformAction } from '../../permissions/permissions'
import { AddProductDialog } from './AddProductDialog'
import { SellDialog } from './SellDialog'
import { StockInDialog } from './StockInDialog'
import { StockLotsPanel } from './StockLotsPanel'
import { EditHsnDialog } from './EditHsnDialog'
import { SetPriceDialog } from './SetPriceDialog'
import { ProductCard } from './ProductCard'
import { ProductsToolbar } from './ProductsToolbar'
import { countByFilter, filterProducts, sortProducts } from './productFilters'
import type { ProductFilter, ProductSort } from './productFilters'

type ProductDialog = 'sell' | 'stockIn' | 'lots' | 'hsn' | 'price'

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
  const canSell = canPerformAction('product:record-sale', useAuthStore((state) => state.user?.role))
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [filter, setFilter] = useState<ProductFilter>('all')
  const [sort, setSort] = useState<ProductSort>('name')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [dialog, setDialog] = useState<{ kind: ProductDialog; product: AncillaryProduct } | null>(null)

  useOnValuesChange([deferredSearch, filter, sort], () => setPage(0))

  const clearFilters = () => { setSearch(''); setFilter('all') }
  const closeDialog = () => setDialog(null)
  const shownProducts = sortProducts(filterProducts(products, filter, deferredSearch), sort)

  const totalElements = shownProducts.length
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const pagedProducts = shownProducts.slice(safePage * pageSize, (safePage + 1) * pageSize)
  const productsPaged: PagedResponse<AncillaryProduct> = {
    content: pagedProducts,
    page: safePage,
    pageSize,
    totalElements,
    totalPages,
    hasNext: safePage < totalPages - 1,
    hasPrevious: safePage > 0,
  }

  return (
    <div className="space-y-4">
      {!loading && products.length > 0 && (
        <ProductsToolbar
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          counts={countByFilter(products)}
          sort={sort}
          onSortChange={setSort}
          shownCount={totalElements}
          totalCount={products.length}
          onClearFilters={clearFilters}
        />
      )}

      {loading ? (
        <SkeletonTable rows={3} cols={3} />
      ) : products.length === 0 ? (
        <EmptyState icon="generic" title={t('products.emptyTitle')} subtitle={t('products.emptySubtitle')} />
      ) : shownProducts.length === 0 ? (
        <div className="ui-empty space-y-3">
          <p className="text-sm font-semibold text-ink">{t('products.noMatchTitle')}</p>
          <p className="text-sm">{t('products.noMatchSubtitle')}</p>
          <button type="button" onClick={clearFilters} className="ui-btn ui-btn-secondary ui-btn-compact min-h-11 md:min-h-8">
            {t('common:actions.clearFilters')}
          </button>
        </div>
      ) : (
        <>
          <ul aria-label={t('products.listLabel')} className="grid grid-cols-1 gap-(--density-gap) md:grid-cols-2 xl:grid-cols-3">
            {pagedProducts.map((product) => {
              const open = (kind: ProductDialog) => () => setDialog({ kind, product })
              return (
                <li key={product.id} className="min-w-0">
                  <ProductCard
                    pumpId={pumpId}
                    product={product}
                    isOwnerOrAdmin={isOwnerOrAdmin}
                    isManagerOrAbove={isManagerOrAbove}
                    canSell={canSell}
                    onSell={open('sell')}
                    onStockIn={open('stockIn')}
                    onShowLots={open('lots')}
                    onSetPrice={open('price')}
                    onEditHsn={open('hsn')}
                  />
                </li>
              )
            })}
          </ul>
          <Pagination
            data={productsPaged}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(0) }}
            pageSizeOptions={[10, 20, 50]}
          />
        </>
      )}

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

      {dialog?.kind === 'sell' && (
        <SellDialog
          pumpId={pumpId}
          product={dialog.product}
          onClose={closeDialog}
          onSuccess={closeDialog}
        />
      )}

      {dialog?.kind === 'stockIn' && (
        <StockInDialog
          pumpId={pumpId}
          products={[dialog.product]}
          onClose={closeDialog}
          onSuccess={() => {
            closeDialog()
            onRefresh()
            qc.invalidateQueries({ queryKey: ['ancillaryDeliveries', pumpId] })
          }}
        />
      )}

      {dialog?.kind === 'hsn' && (
        <EditHsnDialog
          pumpId={pumpId}
          product={dialog.product}
          onClose={closeDialog}
          onSuccess={() => {
            closeDialog()
            onRefresh()
          }}
        />
      )}

      {dialog?.kind === 'price' && (
        <SetPriceDialog pumpId={pumpId} product={dialog.product} onClose={closeDialog} />
      )}

      {dialog?.kind === 'lots' && (
        <StockLotsPanel
          pumpId={pumpId}
          product={dialog.product}
          isOwnerOrAdmin={isOwnerOrAdmin}
          onClose={closeDialog}
          onUpdated={() => {
            onRefresh()
            qc.invalidateQueries({ queryKey: ['ancillaryLots', pumpId, dialog.product.id] })
          }}
        />
      )}
    </div>
  )
}
