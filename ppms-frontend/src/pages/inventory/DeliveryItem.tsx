import { useState } from 'react'
import { codeLabel } from '../../constants/labels'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TankerDelivery } from '../../api/inventoryApi'
import { IconButton } from '../../components/IconButton'
import { LitresText, MoneyText } from '../../components/AmountText'
import { EditDeliveryModal } from './EditDeliveryModal'
import { FUEL_COLORS } from './inventoryFormat'
import { formatCurrency } from '../../utils/format'

// ── Delivery item (compact card inside invoice group) ─────────────────────────

export function DeliveryItem({ delivery, pumpId, isOwnerOrAdmin }: {
  delivery: TankerDelivery
  pumpId: number
  isOwnerOrAdmin: boolean
}) {
  const { t } = useTranslation('inventory')
  const cols = FUEL_COLORS[delivery.fuelType] ?? FUEL_COLORS.PETROL
  const [editing, setEditing] = useState(false)
  return (
    <>
      <div className={`grid gap-3 rounded-control bg-bg px-3 py-2.5 text-xs items-center ${
        isOwnerOrAdmin
          ? 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
          : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
      }`}>
        <span className="font-semibold text-ink">{delivery.tankIdentifier}</span>
        <span className={`font-medium px-2 py-0.5 rounded-badge justify-self-start ${cols.badge}`}>
          {codeLabel(delivery.fuelType)}
        </span>
        <LitresText value={delivery.quantityDelivered} className="text-right text-ink-2" />
        {isOwnerOrAdmin && (
          <span className="text-right text-ink-3 tabular-nums">{formatCurrency(delivery.costPricePerUnit)}/L</span>
        )}
        {isOwnerOrAdmin && (
          <MoneyText value={delivery.totalCost} className="text-right font-semibold text-ink" />
        )}
        <IconButton
          onClick={() => setEditing(true)}
          className="text-ink-3 hover:text-primary transition-colors"
          label={t('deliveries.editDelivery')}
          icon={<Pencil size={13} />}
        />
      </div>
      {editing && (
        <EditDeliveryModal
          delivery={delivery}
          pumpId={pumpId}
          isOwnerOrAdmin={isOwnerOrAdmin}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}
