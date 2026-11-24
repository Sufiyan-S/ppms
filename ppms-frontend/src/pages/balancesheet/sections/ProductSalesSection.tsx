import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useAuthStore } from '../../../store/authStore'
import type { ProductSalesSummary } from '../../../api/balanceSheetApi'
import { Td } from '../bsTableCells'
import { bsColumn } from '../bsFormat'
import { DataTable } from '../../../components/DataTable'
import type { DataTableColumn } from '../../../components/DataTable'
import { MoneyText } from '../../../components/AmountText'

type ProductLine = ProductSalesSummary['productLines'][number]

function productColumns(t: TFunction<['balancesheet', 'common']>, isOwnerOrAdmin: boolean): DataTableColumn<ProductLine>[] {
  return [
    bsColumn('product', t('columns.product')),
    bsColumn('units', t('columns.unitsSold'), true),
    bsColumn('revenue', t('columns.revenue'), true),
    ...(isOwnerOrAdmin ? [bsColumn<ProductLine>('cogs', t('columns.cogs'), true), bsColumn<ProductLine>('profit', t('columns.grossProfit'), true)] : []),
  ]
}

// ── Ancillary product sales section (DAY reports only) ─────────────────────────

export function ProductSalesSection({ productSales }: { productSales: ProductSalesSummary }) {
  const { t } = useTranslation(['balancesheet', 'common'])
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  return (
    <section>
      <h3 className="ui-section-heading mb-3">
        {t('products.title')}
        <span className="ml-2 font-normal text-ink-3">
          {t('products.count', { count: productSales.productLines.length })}
        </span>
      </h3>
      <DataTable
        caption={t('products.caption')}
        captionHidden
        regionLabel={t('products.region')}
        columns={productColumns(t, isOwnerOrAdmin)}
        rows={productSales.productLines}
        rowKey={(line) => line.productId}
        renderRow={(line) => {
          const lineProfit = line.revenue - line.cogs
          return (
            <tr>
              <Td><span className="font-medium text-ink">{line.productName}</span></Td>
              <Td right>{line.unitsSold}</Td>
              <Td right><MoneyText value={line.revenue} /></Td>
              {isOwnerOrAdmin && <Td right><MoneyText value={line.cogs} /></Td>}
              {isOwnerOrAdmin && <Td right>
                <MoneyText value={lineProfit} tone={lineProfit >= 0 ? 'ok' : 'bad'} className="font-medium" />
              </Td>}
            </tr>
          )
        }}
        footer={
          <tr className="bg-surface-sunken">
            <Td>{t('common:fields.total')}</Td>
            <Td right>—</Td>
            <Td right><MoneyText value={productSales.totalRevenue} /></Td>
            {isOwnerOrAdmin && <Td right><MoneyText value={productSales.totalCogs} /></Td>}
            {isOwnerOrAdmin && <Td right>
              <MoneyText value={productSales.grossProfit} tone={productSales.grossProfit >= 0 ? 'ok' : 'bad'} />
            </Td>}
          </tr>
        }
      />
    </section>
  )
}
