import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct } from '../../api/ancillaryApi'
import { Pagination } from '../../components/Pagination'
import { EmptyState } from '../../components/EmptyState'
import { BackfillSaleModal } from './BackfillSaleModal'
import { fmtCurrency, fmtDate } from './ancillaryFormat'
import { ScrollRegion } from '../../components/ScrollRegion'
import { codeLabel } from '../../constants/labels'

// ── Sales History Tab ─────────────────────────────────────────────────────────

export function SalesTab({
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
            <ScrollRegion label="Product sales" className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase border-b border-slate-100">
                    <th scope="col" className="px-5 py-3 text-left">Date</th>
                    <th scope="col" className="px-5 py-3 text-left">Product</th>
                    <th scope="col" className="px-5 py-3 text-right">Qty</th>
                    <th scope="col" className="px-5 py-3 text-right">Price/Unit</th>
                    <th scope="col" className="px-5 py-3 text-right">Total</th>
                    <th scope="col" className="px-5 py-3 text-left">Mode</th>
                    <th scope="col" className="px-5 py-3 text-left">Client</th>
                    <th scope="col" className="px-5 py-3 text-left">Type</th>
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
                          {codeLabel(s.paymentMode)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{s.clientName ?? '—'}</td>
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
            </ScrollRegion>
            {salesPageData && (
              <div className="px-5">
                <Pagination
                  data={salesPageData}
                  onPageChange={setSalesPage}
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
