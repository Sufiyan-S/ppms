import { useAuthStore } from '../../../store/authStore'
import type { ProductSalesSummary } from '../../../api/balanceSheetApi'
import { Td, Th } from '../bsTableCells'
import { fmtMoney } from '../bsFormat'
import { ScrollRegion } from '../../../components/ScrollRegion'

// ── Ancillary product sales section (DAY reports only) ─────────────────────────

export function ProductSalesSection({ productSales }: { productSales: ProductSalesSummary }) {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  return (
    <section>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Ancillary Product Sales
        <span className="ml-2 text-slate-500 normal-case font-normal">
          ({productSales.productLines.length} product{productSales.productLines.length !== 1 ? 's' : ''})
        </span>
      </h3>
      <ScrollRegion label="Product sales" className="ui-card p-0 overflow-x-auto border-emerald-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-emerald-50 text-left">
              <Th>Product</Th>
              <Th right>Units Sold</Th>
              <Th right>Revenue</Th>
              {isOwnerOrAdmin && <Th right>COGS</Th>}
              {isOwnerOrAdmin && <Th right>Gross Profit</Th>}
            </tr>
          </thead>
          <tbody>
            {productSales.productLines.map(line => {
              const lineProfit = line.revenue - line.cogs
              const profitColor = lineProfit >= 0 ? 'text-emerald-600' : 'text-red-600'
              return (
                <tr key={line.productId} className="border-t border-emerald-100 hover:bg-emerald-50 transition-colors">
                  <Td><span className="font-medium text-slate-700">{line.productName}</span></Td>
                  <Td right>{line.unitsSold}</Td>
                  <Td right>{fmtMoney(line.revenue)}</Td>
                  {isOwnerOrAdmin && <Td right>{fmtMoney(line.cogs)}</Td>}
                  {isOwnerOrAdmin && <Td right>
                    <span className={`font-medium ${profitColor}`}>{fmtMoney(lineProfit)}</span>
                  </Td>}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-emerald-50 font-semibold border-t border-emerald-200">
              <Td>Total</Td>
              <Td right>—</Td>
              <Td right>{fmtMoney(productSales.totalRevenue)}</Td>
              {isOwnerOrAdmin && <Td right>{fmtMoney(productSales.totalCogs)}</Td>}
              {isOwnerOrAdmin && <Td right>
                <span className={productSales.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                  {fmtMoney(productSales.grossProfit)}
                </span>
              </Td>}
            </tr>
          </tfoot>
        </table>
      </ScrollRegion>
    </section>
  )
}
