import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryProduct, AncillarySale } from '../../api/ancillaryApi'
import { Pagination } from '../../components/Pagination'
import { EmptyState } from '../../components/EmptyState'
import { LoadError } from '../../components/LoadError'
import { SkeletonRows } from '../../components/Skeleton'
import { BackfillSaleModal } from './BackfillSaleModal'
import { fmtDate, paymentModeBadge } from './ancillaryFormat'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { PageSection } from '../../components/layout/PageSection'
import { useIsPhone } from '../../hooks/useIsPhone'

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

  const { data: salesPageData, isLoading, isLoadingError, refetch } = useQuery({
    queryKey: ['ancillarySales', pumpId, salesPage, salesPageSize],
    queryFn:  () => ancillaryApi.getSales(pumpId, salesPage, salesPageSize),
  })
  const sales = salesPageData?.content ?? []
  const isPhone = useIsPhone()

  const phoneColumns: DataTableColumn<AncillarySale>[] = [
    {
      key: 'product', header: t('fields.product'), cell: (sale) => (
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-medium text-ink">{sale.productDisplayName}</span>
            <span className="block text-xs text-ink-3">
              {fmtDate(sale.saleDate)} · {sale.quantityUnits} × <MoneyText value={sale.sellingPricePerUnit} />
            </span>
          </span>
          <MoneyText value={sale.totalAmount} className="font-semibold text-ink" />
        </span>
      ),
    },
    {
      key: 'mode', header: t('salesTab.mode'), cell: (sale) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge {...paymentModeBadge(sale.paymentMode)} />
          {sale.clientName && <span className="text-xs text-ink-3">{sale.clientName}</span>}
          {sale.isBackfilled && <StatusBadge tone="info" icon={History} label={t('fields.backfilled')} />}
        </span>
      ),
    },
  ]

  const columns: DataTableColumn<AncillarySale>[] = isPhone ? phoneColumns : [
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
        {isLoading ? (
          <div className="px-5 py-4" aria-busy="true"><SkeletonRows count={5} /></div>
        ) : isLoadingError ? (
          <LoadError onRetry={() => void refetch()} className="m-4" />
        ) : sales.length === 0 ? (
          <EmptyState icon="transactions" title={t('salesTab.emptyTitle')} subtitle={t('salesTab.emptySubtitle')} />
        ) : (
          <>
            <DataTable
              caption={t('salesTab.caption')}
              captionHidden
              columns={columns}
              rows={sales}
              rowKey={(sale) => sale.id}
              cardsOnPhone
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
