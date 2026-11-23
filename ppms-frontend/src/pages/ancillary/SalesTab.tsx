import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct, AncillarySale } from '../../api/ancillaryApi'
import { Pagination } from '../../components/Pagination'
import { EmptyState } from '../../components/EmptyState'
import { BackfillSaleModal } from './BackfillSaleModal'
import { fmtDate, paymentModeBadge } from './ancillaryFormat'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { PageSection } from '../../components/layout/PageSection'

export function SalesTab({
  pumpId,
  products,
  isBackfilling,
  onBackfillClosed,
  onRefresh,
}: {
  pumpId: number
  products: AncillaryProduct[]
  isBackfilling: boolean
  onBackfillClosed: () => void
  onRefresh: () => void
}) {
  const { t } = useTranslation(['ancillary', 'common'])
  const qc = useQueryClient()
  const [salesPage, setSalesPage] = useState(0)
  const [salesPageSize, setSalesPageSize] = useState(10)

  const { data: salesPageData } = useQuery({
    queryKey: ['ancillarySales', pumpId, salesPage, salesPageSize],
    queryFn:  () => ancillaryApi.getSales(pumpId, salesPage, salesPageSize),
  })
  const sales = salesPageData?.content ?? []

  const columns: DataTableColumn<AncillarySale>[] = [
    { key: 'date', header: t('fields.date'), className: 'px-5 text-ink-2 whitespace-nowrap', cell: (sale) => fmtDate(sale.saleDate) },
    { key: 'product', header: t('fields.product'), className: 'px-5 text-ink font-medium max-w-[180px] truncate', cell: (sale) => sale.productDisplayName },
    { key: 'qty', header: t('fields.qty'), numeric: true, className: 'px-5', cell: (sale) => sale.quantityUnits },
    { key: 'pricePerUnit', header: t('salesTab.pricePerUnit'), numeric: true, className: 'px-5 text-ink-3', cell: (sale) => <MoneyText value={sale.sellingPricePerUnit} /> },
    { key: 'total', header: t('common:fields.total'), numeric: true, className: 'px-5 font-semibold text-ink', cell: (sale) => <MoneyText value={sale.totalAmount} /> },
    { key: 'mode', header: t('salesTab.mode'), className: 'px-5', cell: (sale) => <StatusBadge {...paymentModeBadge(sale.paymentMode)} /> },
    { key: 'client', header: t('fields.client'), className: 'px-5 text-ink-3', cell: (sale) => sale.clientName ?? '—' },
    { key: 'type', header: t('fields.type'), className: 'px-5', cell: (sale) => sale.isBackfilled && <StatusBadge tone="info" icon={History} label={t('fields.backfilled')} /> },
  ]

  return (
    <>
      <PageSection title={t('salesTab.title')} flush>
        {sales.length === 0 ? (
          <EmptyState icon="transactions" title={t('salesTab.emptyTitle')} subtitle={t('salesTab.emptySubtitle')} />
        ) : (
          <>
            <DataTable
              caption={t('salesTab.caption')}
              captionHidden
              columns={columns}
              rows={sales}
              rowKey={(sale) => sale.id}
              className="rounded-none border-0"
            />
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
      </PageSection>

      {isBackfilling && (
        <BackfillSaleModal
          pumpId={pumpId}
          products={products.filter(p => p.status === 'ACTIVE')}
          onClose={onBackfillClosed}
          onSuccess={() => {
            onBackfillClosed()
            setSalesPage(0)
            qc.invalidateQueries({ queryKey: ['ancillarySales', pumpId] })
            qc.invalidateQueries({ queryKey: ['ancillaryProducts', pumpId] })
            onRefresh()
          }}
        />
      )}
    </>
  )
}
