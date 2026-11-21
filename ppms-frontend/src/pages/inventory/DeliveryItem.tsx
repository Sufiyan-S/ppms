import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { TankerDelivery } from '../../api/inventoryApi'
import { IconButton } from '../../components/IconButton'
import { EditDeliveryModal } from './EditDeliveryModal'
import { FUEL_COLORS } from './inventoryFormat'

// ── Delivery item (compact card inside invoice group) ─────────────────────────

export function DeliveryItem({ delivery, pumpId, isOwnerOrAdmin }: {
  delivery: TankerDelivery
  pumpId: number
  isOwnerOrAdmin: boolean
}) {
  const cols = FUEL_COLORS[delivery.fuelType] ?? FUEL_COLORS.PETROL
  const [editing, setEditing] = useState(false)
  return (
    <>
      <div className={`grid gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs items-center ${
        isOwnerOrAdmin
          ? 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
          : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]'
      }`}>
        <span className="font-semibold text-slate-700">{delivery.tankIdentifier}</span>
        <span className={`font-medium px-2 py-0.5 rounded-full justify-self-start ${cols.badge}`}>
          {delivery.fuelType}
        </span>
        <span className="text-right text-slate-600">
          {delivery.quantityDelivered.toLocaleString('en-IN', { minimumFractionDigits: 1 })} L
        </span>
        {isOwnerOrAdmin && (
          <span className="text-right text-slate-500">₹{delivery.costPricePerUnit.toFixed(4)}/L</span>
        )}
        {isOwnerOrAdmin && (
          <span className="text-right font-semibold text-slate-800">
            ₹{delivery.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        )}
        <IconButton
          onClick={() => setEditing(true)}
          className="text-slate-500 hover:text-blue-600 transition-colors"
          label="Edit delivery"
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
