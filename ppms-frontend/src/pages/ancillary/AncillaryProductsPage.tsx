import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Package, Plus, ShoppingCart } from 'lucide-react'
import { usePumpStore } from '../../store/usePumpStore'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import { canPerformAction } from '../../permissions/permissions'
import { StatusBadge } from '../../components/StatusBadge'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageTabs } from '../../components/layout/PageTabs'
import { useActiveTab } from '../../components/layout/useActiveTab'
import { useUrlParam } from '../../components/layout/useUrlParam'
import { ProductsTab } from './ProductsTab'
import { SalesTab } from './SalesTab'
import { StockInTab } from './StockInTab'
import { SellDialog } from './SellDialog'
import { SellProductPicker } from './SellProductPicker'

const TAB_IDS = ['products', 'stock-in', 'sales'] as const

export default function AncillaryProductsPage() {
  const { t } = useTranslation(['ancillary', 'common'])
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isManagerOrAbove = isOwnerOrAdmin || user?.role === 'MANAGER'
  const canSell = canPerformAction('product:record-sale', user?.role)

  const { selectedPumpId: pumpId } = usePumpStore()
  const activeTab = useActiveTab(TAB_IDS, 'products')
  const action = useUrlParam('action')
  const [productToSell, setProductToSell] = useState<AncillaryProduct | null>(null)

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['ancillaryProducts', pumpId],
    queryFn:  () => ancillaryApi.getProducts(pumpId!),
    enabled:  !!pumpId,
  })

  if (!pumpId && !isOwnerOrAdmin) {
    return (
      <Page>
        <div className="ui-alert ui-alert-warning text-sm">
          {t('common:notices.notAssigned')}
        </div>
      </Page>
    )
  }

  const refreshProducts = () => qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })
  const closeSale = () => {
    setProductToSell(null)
    action.remove()
  }
  const tabs = [
    { id: 'products', label: t('tabs.products') },
    { id: 'stock-in', label: t('tabs.stockIn') },
    { id: 'sales', label: t('tabs.sales') },
  ]

  const sellButton = canSell && pumpId && activeTab !== 'stock-in' && (
    <button type="button" onClick={() => action.set('sell-product')} className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
      <ShoppingCart size={14} strokeWidth={2} aria-hidden="true" />
      {t('page.sellProduct')}
    </button>
  )
  const primaryAction = activeTab === 'stock-in'
    ? isManagerOrAbove && pumpId && (
      <button type="button" onClick={() => action.set('stock-in')} className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
        <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
        {t('stockInTab.record')}
      </button>
    )
    : sellButton
  const secondaryAction = isOwnerOrAdmin && pumpId && (
    activeTab === 'products' ? (
      <button type="button" onClick={() => action.set('add-product')} className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5">
        <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
        {t('products.add')}
      </button>
    ) : activeTab === 'sales' ? (
      <button type="button" onClick={() => action.set('backfill-sale')} className="ui-btn ui-btn-secondary">
        {t('salesTab.backfillSale')}
      </button>
    ) : null
  )

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={pumpId && !productsLoading && (
          <StatusBadge tone="neutral" icon={Package} label={t('page.productCount', { count: products.length })} />
        )}
        secondaryActions={secondaryAction}
        primaryAction={primaryAction}
        tabs={pumpId && <PageTabs label={t('page.views')} tabs={tabs} activeTab={activeTab} resetParams={['action']} />}
      />

      {!pumpId ? (
        <div className="ui-empty">
          {t('common:notices.noPump')}
        </div>
      ) : (
        <div key={activeTab} className="ui-tab-content">
          {activeTab === 'products' && (
            <ProductsTab
              pumpId={pumpId}
              products={products}
              loading={productsLoading}
              isOwnerOrAdmin={isOwnerOrAdmin}
              isManagerOrAbove={isManagerOrAbove}
              isAddingProduct={action.value === 'add-product' && isOwnerOrAdmin}
              onAddProductClosed={action.remove}
              onRefresh={refreshProducts}
            />
          )}
          {activeTab === 'stock-in' && (
            <StockInTab
              pumpId={pumpId}
              products={products.filter(p => p.status === 'ACTIVE')}
              isManagerOrAbove={isManagerOrAbove}
              isRecording={action.value === 'stock-in' && isManagerOrAbove}
              onRecordClosed={action.remove}
              onRefresh={refreshProducts}
            />
          )}
          {activeTab === 'sales' && (
            <SalesTab
              pumpId={pumpId}
              products={products}
              isBackfilling={action.value === 'backfill-sale' && isOwnerOrAdmin}
              onBackfillClosed={action.remove}
              onRefresh={refreshProducts}
            />
          )}
        </div>
      )}

      {pumpId && canSell && action.value === 'sell-product' && !productsLoading && !productToSell && (
        <SellProductPicker products={products} onPick={setProductToSell} onClose={closeSale} />
      )}
      {pumpId && productToSell && (
        <SellDialog
          pumpId={pumpId}
          product={productToSell}
          onClose={closeSale}
          onSuccess={() => {
            closeSale()
            refreshProducts()
            qc.invalidateQueries({ queryKey: ['ancillarySales', pumpId] })
          }}
        />
      )}
    </Page>
  )
}
