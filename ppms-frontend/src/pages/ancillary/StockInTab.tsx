import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { ancillaryApi } from '../../api/ancillaryApi'
import type { AncillaryStockDelivery, AncillaryProduct } from '../../api/ancillaryApi'
import { Pagination } from '../../components/Pagination'
import { EmptyState } from '../../components/EmptyState'
import { StockInDialog } from './StockInDialog'
import { fmtDate } from './ancillaryFormat'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { PageSection } from '../../components/layout/PageSection'

export function StockInTab({
  pumpId, products, isManagerOrAbove, isRecording, onRecordClosed, onRefresh,
}: {
  pumpId: number
  products: AncillaryProduct[]
  isManagerOrAbove: boolean
  isRecording: boolean
  onRecordClosed: () => void
  onRefresh: () => void
}) {
  const { t } = useTranslation('ancillary')
  const qc = useQueryClient()
  const [deliveryPage, setDeliveryPage] = useState(0)
  const [deliveryPageSize, setDeliveryPageSize] = useState(10)
  const productMap = new Map(products.map((product) => [product.id, product]))

  const { data: deliveriesPage } = useQuery({
    queryKey: ['ancillaryDeliveries', pumpId, deliveryPage, deliveryPageSize],
    queryFn:  () => ancillaryApi.getDeliveries(pumpId, deliveryPage, deliveryPageSize),
  })
  const deliveries = deliveriesPage?.content ?? []

  const columns: DataTableColumn<AncillaryStockDelivery>[] = [
    { key: 'date', header: t('fields.date'), className: 'px-5 text-ink-2', cell: (d) => fmtDate(d.deliveryDate) },
    { key: 'product', header: t('fields.product'), className: 'px-5', cell: (d) => (
      <div className="flex flex-col">
        <span className="font-medium text-ink">{productMap.get(d.productId)?.displayName ?? t('stockInTab.productFallback', { id: d.productId })}</span>
        <span className="text-xs text-ink-3">#{d.productId}</span>
      </div>
    ) },
    { key: 'qty', header: t('fields.qty'), numeric: true, className: 'px-5 font-medium', cell: (d) => d.quantityUnits },
    { key: 'costPerUnit', header: t('stockInTab.costPerUnit'), numeric: true, className: 'px-5', cell: (d) => <MoneyText value={d.costPricePerUnit} /> },
    { key: 'totalCost', header: t('stockInTab.totalCost'), numeric: true, className: 'px-5 font-medium', cell: (d) => <MoneyText value={d.costPricePerUnit * d.quantityUnits} /> },
    { key: 'invoice', header: t('stockInTab.invoice'), className: 'px-5 text-ink-3', cell: (d) => d.invoiceReference ?? '—' },
    { key: 'type', header: t('fields.type'), className: 'px-5', cell: (d) => d.isBackfilled && <StatusBadge tone="info" icon={History} label={t('fields.backfilled')} /> },
  ]

  return (
    <div className="flex flex-col gap-(--density-gap)">
      {!isManagerOrAbove && (
        <div className="ui-alert ui-alert-warning text-sm">
          {t('stockInTab.onlyManagers')}
        </div>
      )}

      {isRecording && (
        <StockInDialog
          pumpId={pumpId}
          products={products}
          onClose={onRecordClosed}
          onSuccess={() => {
            onRecordClosed()
            setDeliveryPage(0)
            qc.invalidateQueries({ queryKey: ['ancillaryDeliveries', pumpId] })
            onRefresh()
          }}
        />
      )}

      <PageSection title={t('stockInTab.recent')} flush>
        {deliveries.length === 0 ? (
          <EmptyState icon="generic" title={t('stockInTab.emptyTitle')} subtitle={t('stockInTab.emptySubtitle')} />
        ) : (
          <>
          <DataTable
            caption={t('stockInTab.caption')}
            captionHidden
            columns={columns}
            rows={deliveries}
            rowKey={(d) => d.id}
            className="rounded-none border-0"
          />
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
      </PageSection>
    </div>
  )
}
