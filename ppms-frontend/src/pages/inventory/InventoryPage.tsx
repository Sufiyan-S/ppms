import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Plus } from 'lucide-react'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { inventoryApi } from '../../api/inventoryApi'
import type { TankStock } from '../../api/inventoryApi'
import { canPerformAction } from '../../permissions/permissions'
import { useAuthStore } from '../../store/authStore'
import { DipCheckModal } from './DipCheckModal'
import { FuelLotsDialog } from './FuelLotsDialog'
import { TankStockBar } from './TankStockBar'
import { RecordDeliveryModal } from './record-delivery/RecordDeliveryModal'
import { InventoryAlerts } from './InventoryAlerts'
import { DeliveryHistory } from './DeliveryHistory'
import { DipHistory } from './DipHistory'

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canViewFinancials = isOwnerOrAdmin || user?.role === 'MANAGER'
  const canDeleteInvoice = canViewFinancials
  const canRecordDipCheck = canPerformAction('inventory:record-dip-check', user?.role)

  const { selectedPumpId } = usePumpStore()
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [dipTankId,         setDipTankId]         = useState<number | null>(null)
  const [lotsForTank,       setLotsForTank]       = useState<TankStock | null>(null)
  const [stockOpen,         setStockOpen]         = useState(true)


  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    enabled:  isOwnerOrAdmin,
  })
  const sortedPumps = [...pumps].sort((a, b) => a.name.localeCompare(b.name))

  const pumpId = selectedPumpId

  const { data: tanks = [], isLoading: tanksLoading, dataUpdatedAt: tanksUpdatedAt } = useQuery({
    queryKey: ['tankStocks', pumpId],
    queryFn:  () => inventoryApi.getTankStocks(pumpId!),
    enabled:  !!pumpId,
    refetchInterval: 60_000,
  })


  // Always fetch DIP checks (page 0 only) so we can compute overdue alerts on every page load.
  // The history accordion adds its own paginated query when opened.
  const { data: dipChecksAlertPage } = useQuery({
    queryKey: ['dipChecks', pumpId, 'alert'],
    queryFn:  () => inventoryApi.getDipChecks(pumpId!, 0, 50),
    enabled:  !!pumpId,
    // Refresh every 10 minutes so the alert badge stays current without a page reload
    refetchInterval: 10 * 60_000,
  })


  // Compute last-checked timestamp per tank from alert page (newest-first, page 0)
  const lastDipByTankId = new Map<number, Date>()
  for (const d of (dipChecksAlertPage?.content ?? [])) {
    if (!lastDipByTankId.has(d.tankId)) {
      lastDipByTankId.set(d.tankId, new Date(d.checkedAt))
    }
  }

  const now = tanksUpdatedAt
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

  // A tank is DIP-overdue if it has never been checked OR last check was >24 h ago
  const dipOverdueTanks = tanks.filter(t => {
    const last = lastDipByTankId.get(t.tankId)
    return !last || now - last.getTime() > TWENTY_FOUR_HOURS
  })

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <div className="p-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-700 text-sm">
          You are not assigned to any pump. Ask the Owner or Admin to assign you.
        </div>
      </div>
    )
  }

  const selectedPump = sortedPumps.find(p => p.id === pumpId)
  const lowStockTanks = tanks.filter(t => t.lowStock)

  return (
    <div className="ui-page ui-page--narrow space-y-5">
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Stock control</p>
          <h1 className="ui-title-sm">Inventory</h1>
          <p className="ui-subtitle">
            Tank stock levels, tanker deliveries, and DIP checks.
          </p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Low stock</span>
            <span className="ui-section-meta-value">{lowStockTanks.length}</span>
          </div>
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">DIP overdue</span>
            <span className="ui-section-meta-value">{dipOverdueTanks.length}</span>
          </div>
        </div>
      </div>

      {!pumpId ? (
        <div className="ui-empty">
          No pump selected. Use the pump selector in the top navigation bar.
        </div>
      ) : (
        <>
          <InventoryAlerts lowStockTanks={lowStockTanks} dipOverdueTanks={dipOverdueTanks} />

          {/* ── Tank stock levels ── */}
          <div className="ui-card p-0">
            {/* Header row — always visible, clickable to toggle */}
            <div className="ui-toolbar border-b-0">
              <button
                type="button"
                onClick={() => setStockOpen(v => !v)}
                className="flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
              >
                <span className="ui-toolbar-title mr-0">Current Stock Levels</span>
                {selectedPump && (
                  <span className="text-xs text-slate-500">{selectedPump.name}</span>
                )}
                <span className={`ui-accordion-arrow ml-1 ${stockOpen ? 'ui-accordion-arrow--open' : ''}`}><ChevronDown size={14} strokeWidth={2} /></span>
              </button>
              <button
                onClick={() => setShowDeliveryModal(true)}
                className="ui-btn ui-btn-primary shrink-0 ml-auto inline-flex items-center gap-1.5"
              >
                <Plus size={14} strokeWidth={2.5} />
                Record Delivery
              </button>
            </div>

            {stockOpen && (
              <div className="ui-accordion-content border-t border-slate-100">
                {tanksLoading ? (
                  <div className="p-6 text-sm text-slate-500">Loading stock levels...</div>
                ) : tanks.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500">
                    No tanks configured. Add nozzles in Setup to auto-create tanks.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {tanks.map(tank => {
                      const last = lastDipByTankId.get(tank.tankId)
                      const dipOverdue = !last || now - last.getTime() > TWENTY_FOUR_HOURS
                      return (
                        <TankStockBar
                          key={tank.tankId}
                          tank={tank}
                          dipOverdue={dipOverdue}
                          lastDipAt={last}
                          now={now}
                          onDipCheck={canRecordDipCheck ? () => setDipTankId(tank.tankId) : undefined}
                          onViewLots={() => setLotsForTank(tank)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <DeliveryHistory pumpId={pumpId} tanks={tanks} isOwnerOrAdmin={isOwnerOrAdmin} canDeleteInvoice={canDeleteInvoice} />
          <DipHistory pumpId={pumpId} tanks={tanks} canViewFinancials={canViewFinancials} />
        </>
      )}

      {/* ── Modals ── */}
      {showDeliveryModal && pumpId && (
        <RecordDeliveryModal
          pumpId={pumpId}
          tanks={tanks}
          isOwnerOrAdmin={isOwnerOrAdmin}
          canSetBillTotal={canViewFinancials}
          onClose={() => setShowDeliveryModal(false)}
        />
      )}
      {dipTankId !== null && pumpId && (
        <DipCheckModal
          pumpId={pumpId}
          tank={tanks.find(t => t.tankId === dipTankId)!}
          onClose={() => setDipTankId(null)}
        />
      )}
      {lotsForTank !== null && pumpId && (
        <FuelLotsDialog
          pumpId={pumpId}
          tank={lotsForTank}
          onClose={() => setLotsForTank(null)}
        />
      )}
    </div>
  )
}
