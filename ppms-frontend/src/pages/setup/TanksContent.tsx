import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Cylinder } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { PumpSummary } from '../../api/pumpApi'
import { inventoryApi } from '../../api/inventoryApi'
import { SkeletonRows } from '../../components/Skeleton'
import { AddTankForm } from './tanks/AddTankForm'
import { TankCard } from './tanks/TankCard'

/** Every underground tank as a card with its stock gauge, then the form to add another. */
export function TanksContent({ pump }: { pump: PumpSummary }) {
  const { t } = useTranslation('setup')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [editingTankId, setEditingTankId] = useState<number | null>(null)

  const { data: tanks = [], isLoading } = useQuery({
    queryKey: ['tanks', pump.id],
    queryFn: () => pumpApi.getTanks(pump.id),
  })
  // Same keys and fetchers as the Inventory page, so both share one copy of the stock levels and recent dips.
  const { data: stocks = [] } = useQuery({
    queryKey: ['tankStocks', pump.id],
    queryFn: () => inventoryApi.getTankStocks(pump.id),
    enabled: tanks.length > 0,
  })
  const { data: recentDips } = useQuery({
    queryKey: ['dipChecks', pump.id, 'alert'],
    queryFn: () => inventoryApi.getDipChecks(pump.id, 0, 50),
    enabled: tanks.length > 0,
  })

  const lowStockTankIds = new Set(stocks.filter((stock) => stock.lowStock).map((stock) => stock.tankId))
  const lastDipAt = (tankId: number) => recentDips?.content.find((dip) => dip.tankId === tankId)?.checkedAt
  const activeNozzles = pump.dus.filter((du) => du.status === 'ACTIVE').flatMap((du) => du.nozzles.filter((n) => n.status === 'ACTIVE'))
  const mappedNozzleCount = (tankId: number) => activeNozzles.filter((nozzle) => nozzle.tankId === tankId).length

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">{t('tanks.intro')}</p>

      {isLoading ? (
        <SkeletonRows count={3} />
      ) : tanks.length === 0 ? (
        <div className="ui-empty flex flex-col items-center gap-2">
          <Cylinder size={28} strokeWidth={1.75} aria-hidden="true" className="text-ink-3" />
          <p className="text-sm font-medium text-ink-2">{t('tanks.emptyTitle')}</p>
          <button type="button" onClick={() => nameInputRef.current?.focus()} className="ui-btn ui-btn-primary">
            {t('tanks.addFirstButton')}
          </button>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tanks.map((tank) => (
            <li key={tank.id}>
              <TankCard
                pumpId={pump.id}
                tank={tank}
                isLow={lowStockTankIds.has(tank.id)}
                lastDipAt={lastDipAt(tank.id)}
                mappedNozzleCount={mappedNozzleCount(tank.id)}
                isEditing={editingTankId === tank.id}
                onEditingChange={(editing) => setEditingTankId(editing ? tank.id : null)}
              />
            </li>
          ))}
        </ul>
      )}

      <AddTankForm pumpId={pump.id} isFirstTank={tanks.length === 0} nameInputRef={nameInputRef} />
    </div>
  )
}
