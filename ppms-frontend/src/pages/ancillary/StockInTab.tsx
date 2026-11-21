import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { Pagination } from '../../components/Pagination'
import { EmptyState } from '../../components/EmptyState'
import { StockInDialog } from './StockInDialog'
import { fmtCurrency, fmtDate } from './ancillaryFormat'
import { ScrollRegion } from '../../components/ScrollRegion'

// ── Stock In Tab ─────────────────────────────────────────────────────────────

export function StockInTab({
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
          <ScrollRegion label="Stock-in history" className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase border-b border-slate-100">
                  <th scope="col" className="px-5 py-3 text-left">Date</th>
                  <th scope="col" className="px-5 py-3 text-left">Product</th>
                  <th scope="col" className="px-5 py-3 text-right">Qty</th>
                  <th scope="col" className="px-5 py-3 text-right">Cost/Unit</th>
                  <th scope="col" className="px-5 py-3 text-right">Total Cost</th>
                  <th scope="col" className="px-5 py-3 text-left">Invoice</th>
                  <th scope="col" className="px-5 py-3 text-left">Type</th>
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
                        <span className="text-xs text-slate-500">#{d.productId}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-medium">{d.quantityUnits}</td>
                    <td className="px-5 py-3 text-right">{fmtCurrency(d.costPricePerUnit)}</td>
                    <td className="px-5 py-3 text-right font-medium">
                      {fmtCurrency(d.costPricePerUnit * d.quantityUnits)}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{d.invoiceReference ?? '—'}</td>
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
          </ScrollRegion>
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
