import { Truck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TankerDelivery } from '../../api/inventoryApi'
import { LitresText, MoneyText } from '../../components/AmountText'
import { SidePanel } from '../../components/layout/SidePanel'
import { DeliveryItem } from './DeliveryItem'
import { fmtDate } from './inventoryFormat'

/** The tank lines of one tanker invoice, each with its edit button. */
export function InvoiceDetailsPanel({ invoiceLabel, rows, pumpId, isOwnerOrAdmin, onClose }: {
  invoiceLabel: string
  rows: TankerDelivery[]
  pumpId: number
  isOwnerOrAdmin: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('inventory')
  const first = rows[0]
  const totalQty = rows.reduce((sum, row) => sum + row.quantityDelivered, 0)
  const totalCost = rows.reduce((sum, row) => sum + row.totalCost, 0)

  return (
    <SidePanel
      title={t('deliveries.invoiceTitle', { invoice: invoiceLabel })}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{fmtDate(first.deliveryDate)}</span>
          <span>· {t('deliveries.tankCount', { count: rows.length })}</span>
          {first.tankerName && (
            <span className="inline-flex items-center gap-1">
              · <Truck size={12} strokeWidth={2} aria-hidden="true" />{first.tankerName}
            </span>
          )}
          <span>· {t('deliveries.loggedBy', { name: first.loggedByUserName })}</span>
        </span>
      }
      size="lg"
      onClose={onClose}
      footerClassName="justify-between"
      footer={<>
        <LitresText value={totalQty} className="text-sm font-semibold text-ink" />
        {isOwnerOrAdmin && <MoneyText value={first.billTotal != null ? Number(first.billTotal) : totalCost} className="text-base font-bold text-ink" />}
      </>}
    >
      <div className={`grid gap-3 border-b border-border pb-2 text-xs font-semibold text-ink-3 ${
        isOwnerOrAdmin
          ? 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
          : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
      }`}>
        <span>{t('columns.tank')}</span>
        <span>{t('columns.fuel')}</span>
        <span className="text-right">{t('columns.quantity')}</span>
        {isOwnerOrAdmin && <span className="text-right">{t('columns.rate')}</span>}
        {isOwnerOrAdmin && <span className="text-right">{t('columns.amount')}</span>}
        <span />
      </div>
      <div className="space-y-2 pt-2">
        {rows.map(row => <DeliveryItem key={row.id} delivery={row} pumpId={pumpId} isOwnerOrAdmin={isOwnerOrAdmin} />)}
      </div>
    </SidePanel>
  )
}
