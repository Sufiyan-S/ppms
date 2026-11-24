import { useQuery } from '@tanstack/react-query'
import { codeLabel } from '../../constants/labels'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Ruler } from 'lucide-react'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock, InventoryLotDetail } from '../../api/inventoryApi'
import { SidePanel } from '../../components/layout/SidePanel'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { LitresText } from '../../components/AmountText'
import { fmtDate } from './inventoryFormat'
import { formatCurrency } from '../../utils/format'

function lotColumns(t: TFunction<['inventory', 'common']>): DataTableColumn<InventoryLotDetail>[] {
  return [
  { key: 'date', header: t('lots.inDate'), cell: (lot) => fmtDate(lot.deliveryDate) },
  {
    key: 'invoice',
    header: t('lots.invoice'),
    cell: (lot) => lot.isDipAdjustment
      ? <StatusBadge tone="warn" icon={Ruler} label={t('lots.dipAdjustment')} />
      : (lot.invoiceReference ?? '—'),
  },
  {
    key: 'cost',
    header: t('lots.costPrice'),
    numeric: true,
    cell: (lot) => lot.isDipAdjustment ? '—' : formatCurrency(Number(lot.costPricePerUnit)),
  },
  {
    key: 'remaining',
    header: t('lots.remaining'),
    numeric: true,
    cell: (lot) => <LitresText value={Number(lot.remainingQuantity)} tone="ok" className="font-semibold" />,
  },
  {
    key: 'original',
    header: t('lots.original'),
    numeric: true,
    cell: (lot) => <LitresText value={Number(lot.originalQuantity)} className="text-ink-3" />,
  },
  ]
}

export function FuelLotsDialog({
  pumpId, tank, onClose,
}: {
  pumpId: number
  tank: TankStock
  onClose: () => void
}) {
  const { t } = useTranslation(['inventory', 'common'])
  const { data: lots = [], isLoading } = useQuery<InventoryLotDetail[]>({
    queryKey: ['fuelLots', pumpId, tank.tankId],
    queryFn:  () => inventoryApi.getActiveTankLots(pumpId, tank.tankId),
  })

  return (
    <SidePanel
      title={t('lots.title', { tank: tank.tankIdentifier })}
      subtitle={<>{codeLabel(tank.fuelType)} · {t('lots.currentStock')} <LitresText value={tank.currentStock} /></>}
      size="lg"
      onClose={onClose}
      bodyClassName="p-0"
      footer={<p className="text-xs text-ink-3">{t('lots.fifoNote')}</p>}
    >
      {isLoading ? (
        <p className="ui-empty py-8">{t('lots.loading')}</p>
      ) : lots.length === 0 ? (
        <p className="ui-empty py-8">
          {t('lots.empty')}
        </p>
      ) : (
        <DataTable
          caption={t('lots.caption', { tank: tank.tankIdentifier })}
          captionHidden
          columns={lotColumns(t)}
          rows={lots}
          rowKey={(lot) => lot.id}
        />
      )}
    </SidePanel>
  )
}
