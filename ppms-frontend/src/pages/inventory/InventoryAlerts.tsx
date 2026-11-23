import { AlertTriangle, AlertCircle } from 'lucide-react'
import { codeLabel } from '../../constants/labels'
import { useTranslation } from 'react-i18next'
import type { TankStock } from '../../api/inventoryApi'

export function InventoryAlerts({ lowStockTanks, dipOverdueTanks }: { lowStockTanks: TankStock[]; dipOverdueTanks: TankStock[] }) {
  const { t } = useTranslation('inventory')
  return (
    <>
    {/* ── Low stock alert banner ── */}
    {lowStockTanks.length > 0 && (
      <div className="ui-alert ui-alert-danger flex items-center gap-3">
        <AlertTriangle size={18} strokeWidth={2} className="text-bad shrink-0" />
        <p className="text-sm text-bad font-medium">
          {lowStockTanks.length === 1
            ? t('alerts.lowStockOne', { tank: lowStockTanks[0].tankIdentifier, fuel: codeLabel(lowStockTanks[0].fuelType) })
            : t('alerts.lowStockMany', { number: lowStockTanks.length })}
        </p>
      </div>
    )}

    {/* ── DIP overdue alert banner ── */}
    {dipOverdueTanks.length > 0 && (
      <div className="ui-alert ui-alert-danger flex items-center gap-3">
        <AlertCircle size={18} strokeWidth={2} className="text-bad shrink-0" />
        <div>
          <p className="text-sm text-bad font-medium">
            {dipOverdueTanks.length === 1
              ? t('alerts.dipOverdueOne', { tank: dipOverdueTanks[0].tankIdentifier, fuel: codeLabel(dipOverdueTanks[0].fuelType) })
              : t('alerts.dipOverdueMany', { number: dipOverdueTanks.length })}
          </p>
          <p className="text-xs text-bad mt-0.5">
            {t('alerts.dipRule')}
          </p>
        </div>
      </div>
    )}
    </>
  )
}
