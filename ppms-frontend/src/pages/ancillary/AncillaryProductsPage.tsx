import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePumpStore } from '../../store/usePumpStore'
import { ancillaryApi } from '../../api/ancillaryApi'
import { useAuthStore } from '../../store/authStore'
import { Reveal } from '../../components/Reveal'
import { ProductsTab } from './ProductsTab'
import { SalesTab } from './SalesTab'
import { StockInTab } from './StockInTab'

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
        <h1 className="ui-title-sm">Products</h1>
        <p className="ui-subtitle">
          Manage lubricants, accessories, and other counter products. Track stock and sales.
        </p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Products</span>
            <span className="ui-section-meta-value">{products.length}</span>
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
