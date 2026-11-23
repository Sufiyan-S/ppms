import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Clock, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock } from '../../api/inventoryApi'
import { canPerformAction } from '../../permissions/permissions'
import { useAuthStore } from '../../store/authStore'
import { SkeletonRows } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { DipCheckModal } from './DipCheckModal'
import { FuelLotsDialog } from './FuelLotsDialog'
import { TankStockBar } from './TankStockBar'
import { RecordDeliveryModal } from './record-delivery/RecordDeliveryModal'
import { InventoryAlerts } from './InventoryAlerts'
import { DeliveryHistory } from './DeliveryHistory'
import { DipHistory } from './DipHistory'

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

const RECORD_DELIVERY_ACTION = 'record-delivery'
const DIP_CHECK_ACTION = 'dip-check'

/**
 * ?action=record-delivery opens Record Delivery.
 * ?action=dip-check&tank=<tankId> opens the DIP check for that tank; without a known tank it starts on the first tank,
 * and the form's tank picker switches tank.
 */
export default function InventoryPage() {
  const { t } = useTranslation(['inventory', 'common'])
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canViewFinancials = isOwnerOrAdmin || user?.role === 'MANAGER'
  const canDeleteInvoice = canViewFinancials
  const canRecordDelivery = canPerformAction('inventory:record-delivery', user?.role)
  const canRecordDipCheck = canPerformAction('inventory:record-dip-check', user?.role)

  const { selectedPumpId: pumpId } = usePumpStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [lotsForTank, setLotsForTank] = useState<TankStock | null>(null)
  const action = searchParams.get('action')

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    enabled:  isOwnerOrAdmin,
  })

  const { data: tanks = [], isLoading: tanksLoading, isSuccess: tanksLoaded, dataUpdatedAt: tanksUpdatedAt } = useQuery({
    queryKey: ['tankStocks', pumpId],
    queryFn:  () => inventoryApi.getTankStocks(pumpId!),
    enabled:  !!pumpId,
    refetchInterval: 60_000,
  })

  const { data: dipChecksAlertPage } = useQuery({
    queryKey: ['dipChecks', pumpId, 'alert'],
    queryFn:  () => inventoryApi.getDipChecks(pumpId!, 0, 50),
    enabled:  !!pumpId,
    refetchInterval: 10 * 60_000,
  })

  const lastDipByTankId = new Map<number, Date>()
  for (const d of (dipChecksAlertPage?.content ?? [])) {
    if (!lastDipByTankId.has(d.tankId)) {
      lastDipByTankId.set(d.tankId, new Date(d.checkedAt))
    }
  }

  const now = tanksUpdatedAt
  const isDipOverdue = (tank: TankStock) => {
    const last = lastDipByTankId.get(tank.tankId)
    return !last || now - last.getTime() > TWENTY_FOUR_HOURS
  }
  const dipOverdueTanks = tanks.filter(isDipOverdue)
  const lowStockTanks = tanks.filter(tank => tank.lowStock)

  const updateParams = (change: (params: URLSearchParams) => void, replace: boolean) => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    change(updated)
    return updated
  }, { replace })
  const openAction = (name: string, tankId?: number) => updateParams((params) => {
    params.set('action', name)
    if (tankId === undefined) params.delete('tank')
    else params.set('tank', String(tankId))
  }, false)
  const closeAction = () => updateParams((params) => {
    params.delete('action')
    params.delete('tank')
  }, true)

  const requestedTank = tanks.find(tank => String(tank.tankId) === searchParams.get('tank'))
  const dipCheckTank = requestedTank ?? tanks[0]
  const showDeliveryModal = action === RECORD_DELIVERY_ACTION && canRecordDelivery && tanksLoaded
  const showDipCheck = action === DIP_CHECK_ACTION && canRecordDipCheck && dipCheckTank !== undefined

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <Page>
        <div className="ui-alert ui-alert-warning text-sm">
          {t('common:notices.notAssigned')}
        </div>
      </Page>
    )
  }

  const selectedPump = pumps.find(p => p.id === pumpId)

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={pumpId && (
          <>
            {lowStockTanks.length > 0 && (
              <StatusBadge tone="bad" icon={AlertTriangle} label={t('page.lowStockCount', { count: lowStockTanks.length })} />
            )}
            {dipOverdueTanks.length > 0 && (
              <StatusBadge tone="bad" icon={Clock} label={t('page.dipOverdueCount', { count: dipOverdueTanks.length })} />
            )}
          </>
        )}
        primaryAction={canRecordDelivery && pumpId && (
          <button
            type="button"
            onClick={() => openAction(RECORD_DELIVERY_ACTION)}
            className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            {t('page.recordDelivery')}
          </button>
        )}
      />

      {!pumpId ? (
        <div className="ui-empty">
          {t('common:notices.noPump')}
        </div>
      ) : (
        <>
          <InventoryAlerts lowStockTanks={lowStockTanks} dipOverdueTanks={dipOverdueTanks} />

          <PageSection
            title={t('page.currentStock')}
            actions={selectedPump && <span className="text-xs text-ink-3">{selectedPump.name}</span>}
          >
            {tanksLoading ? (
              <SkeletonRows count={3} />
            ) : tanks.length === 0 ? (
              <p className="text-sm text-ink-3">{t('page.noTanks')}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-(--density-gap) sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {tanks.map(tank => (
                  <li key={tank.tankId}>
                    <TankStockBar
                      tank={tank}
                      dipOverdue={isDipOverdue(tank)}
                      lastDipAt={lastDipByTankId.get(tank.tankId)}
                      now={now}
                      onDipCheck={canRecordDipCheck ? () => openAction(DIP_CHECK_ACTION, tank.tankId) : undefined}
                      onViewLots={() => setLotsForTank(tank)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </PageSection>

          <DeliveryHistory pumpId={pumpId} tanks={tanks} isOwnerOrAdmin={isOwnerOrAdmin} canDeleteInvoice={canDeleteInvoice} />
          <DipHistory pumpId={pumpId} tanks={tanks} canViewFinancials={canViewFinancials} />
        </>
      )}

      {showDeliveryModal && pumpId && (
        <RecordDeliveryModal
          pumpId={pumpId}
          tanks={tanks}
          isOwnerOrAdmin={isOwnerOrAdmin}
          canSetBillTotal={canViewFinancials}
          onClose={closeAction}
        />
      )}
      {showDipCheck && pumpId && (
        <DipCheckModal
          key={dipCheckTank.tankId}
          pumpId={pumpId}
          tank={dipCheckTank}
          tanks={tanks}
          onTankChange={(tankId) => updateParams((params) => params.set('tank', String(tankId)), true)}
          onClose={closeAction}
        />
      )}
      {lotsForTank !== null && pumpId && (
        <FuelLotsDialog
          pumpId={pumpId}
          tank={lotsForTank}
          onClose={() => setLotsForTank(null)}
        />
      )}
    </Page>
  )
}
