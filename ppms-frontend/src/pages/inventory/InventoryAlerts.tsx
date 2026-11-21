import { AlertTriangle, AlertCircle } from 'lucide-react'
import type { TankStock } from '../../api/inventoryApi'

export function InventoryAlerts({ lowStockTanks, dipOverdueTanks }: { lowStockTanks: TankStock[]; dipOverdueTanks: TankStock[] }) {
  return (
    <>
    {/* ── Low stock alert banner ── */}
    {lowStockTanks.length > 0 && (
      <div className="ui-alert ui-alert-danger flex items-center gap-3">
        <AlertTriangle size={18} strokeWidth={2} className="text-red-500 shrink-0" />
        <p className="text-sm text-red-700 font-medium">
          {lowStockTanks.length === 1
            ? `${lowStockTanks[0].tankIdentifier} (${lowStockTanks[0].fuelType}) is below 20% capacity.`
            : `${lowStockTanks.length} tanks are below 20% capacity. Schedule a delivery soon.`}
        </p>
      </div>
    )}

    {/* ── DIP overdue alert banner ── */}
    {dipOverdueTanks.length > 0 && (
      <div className="ui-alert ui-alert-danger flex items-center gap-3">
        <AlertCircle size={18} strokeWidth={2} className="text-red-500 shrink-0" />
        <div>
          <p className="text-sm text-red-700 font-medium">
            {dipOverdueTanks.length === 1
              ? `DIP check overdue on ${dipOverdueTanks[0].tankIdentifier} (${dipOverdueTanks[0].fuelType}).`
              : `DIP check overdue on ${dipOverdueTanks.length} tanks.`}
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            DIP checks should be done at least once every 24 hours to verify physical stock levels.
          </p>
        </div>
      </div>
    )}
    </>
  )
}
