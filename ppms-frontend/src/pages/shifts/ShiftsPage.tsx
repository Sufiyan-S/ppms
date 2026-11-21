import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronDown, Plus, History } from 'lucide-react'
import { shiftApi } from '../../api/shiftApi'
import { pumpApi } from '../../api/pumpApi'
import { usePumpStore } from '../../store/usePumpStore'
import { useAuthStore } from '../../store/authStore'
import { canPerformAction } from '../../permissions/permissions'
import type { Shift } from '../../types/shift'
import OpenShiftModal from './OpenShiftModal'
import CloseShiftModal from './CloseShiftModal'
import BackfillShiftModal from './BackfillShiftModal'
import { SkeletonRows } from '../../components/Skeleton'
import { Reveal } from '../../components/Reveal'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { OpenNewShiftPrompt } from './active/OpenNewShiftPrompt'
import { ShiftRow } from './active/ShiftRow'
import { AllShiftsHistory } from './history/AllShiftsHistory'
import { DayViewHistory } from './history/DayViewHistory'
import { DiscrepanciesHistory } from './history/DiscrepanciesHistory'
import { AddCreditEntryModal } from './modals/AddCreditEntryModal'
import { ScrollRegion } from '../../components/ScrollRegion'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ShiftsPage() {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canOpenShift  = canPerformAction('shift:open', user?.role)
  const canCloseShift = canPerformAction('shift:close', user?.role)

  const { selectedPumpId } = usePumpStore()
  const [showOpenModal,     setShowOpenModal]     = useState(false)
  const [showBackfillModal, setShowBackfillModal] = useState(false)
  const [shiftToClose,      setShiftToClose]      = useState<Shift | null>(null)
  const [shiftIdForCredit,  setShiftIdForCredit]  = useState<number | null>(null)
  const [historyOpen,    setHistoryOpen]    = useState(true)
  const [historyTab,     setHistoryTab]     = useState<'day' | 'all' | 'discrepancies'>('day')
  const [closedShiftPrefill, setClosedShiftPrefill] = useState<{ duId: number; nozzleIds: number[] } | null>(null)

  const { data: rawPumps = [], isLoading: pumpsLoading } = useQuery({
    queryKey: ['myPumps'],
    queryFn:  pumpApi.getMyPumps,
    enabled:  isOwnerOrAdmin,
  })

  // Sort alphabetically once
  const sortedPumps = [...rawPumps].sort((a, b) => a.name.localeCompare(b.name))

  const pumpId = selectedPumpId

  const { data: activeShifts = [], isLoading: activeLoading, isFetching: activeFetching, dataUpdatedAt: activeUpdatedAt } = useQuery({
    queryKey:      ['activeShifts', pumpId],
    queryFn:       () => shiftApi.getActiveShifts(pumpId!),
    enabled:       !!pumpId,
    refetchInterval: 60_000,
  })


  // ── Early exits ──────────────────────────────────────────────────────────

  if (isOwnerOrAdmin && !pumpsLoading && sortedPumps.length === 0 && rawPumps.length === 0) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning p-6 text-center">
          <p className="text-amber-800 font-medium mb-2">No pumps set up yet</p>
          <p className="text-amber-700 text-sm mb-4">
            Create a pump location first, then add nozzles and set fuel prices.
          </p>
          <Link to="/dashboard/setup"
            className="ui-btn ui-btn-primary inline-flex">
            Go to Setup
          </Link>
        </div>
      </div>
    )
  }

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning text-sm">
          You are not assigned to any pump. Ask the Owner or Admin to assign you.
        </div>
      </div>
    )
  }

  const selectedPump = sortedPumps.find((p) => p.id === pumpId)
  const shiftForCredit = activeShifts.find((shift) => shift.id === shiftIdForCredit) ?? null

  return (
    <div className="ui-page ui-page--narrow space-y-6">

      {/* Page title */}
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Shift control</p>
          <h1 className="ui-title-sm">Shifts</h1>
          <p className="ui-subtitle">Open and close operator shifts, record meter readings and payment collection.</p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Open now</span>
            <span className="ui-section-meta-value">{activeLoading ? '…' : activeShifts.length}</span>
          </div>
        </div>
      </div>
      </Reveal>

      {!pumpId ? (
        <div className="ui-card text-center text-sm text-slate-500">
          No pump selected. Use the pump selector in the top navigation bar.
        </div>
      ) : (
        <>
          {/* ── Active Shifts ──────────────────────────────────────────────── */}
          <div className="ui-card overflow-hidden p-0">
            <div className="ui-toolbar">
              <div className="flex items-center gap-2.5">
                <h2 className="ui-toolbar-title">Active Shifts</h2>
                <RefreshIndicator isFetching={activeFetching} dataUpdatedAt={activeUpdatedAt ?? 0} />
              </div>
              {selectedPump && (
                <p className="text-xs text-slate-500">{selectedPump.name}</p>
              )}
              <div className="ui-toolbar-actions ml-auto">
                {isOwnerOrAdmin && (
                  <button
                    onClick={() => setShowBackfillModal(true)}
                    className="ui-btn ui-btn-secondary inline-flex items-center gap-1.5"
                    title="Enter historical shift data for past dates"
                  >
                    <History size={14} strokeWidth={2} />
                    Backfill Shift
                  </button>
                )}
                {canOpenShift && (
                  <button
                    onClick={() => setShowOpenModal(true)}
                    className="ui-btn ui-btn-primary inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    Open Shift
                  </button>
                )}
              </div>
            </div>

            {activeLoading ? (
              <div className="px-5 py-4"><SkeletonRows count={3} /></div>
            ) : activeShifts.length === 0 ? (
              <div className="ui-empty p-6">
                {canOpenShift ? 'No active shifts. Click "+ Open Shift" to start one.' : 'No active shifts.'}
              </div>
            ) : (
              <ScrollRegion label="Active shifts" className="overflow-x-auto">
                <table className="ui-table-cards w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs text-slate-500">
                      <th scope="col" className="text-left px-6 py-3 font-medium">Nozzle</th>
                      <th scope="col" className="text-left px-6 py-3 font-medium">Operator</th>
                      <th scope="col" className="text-left px-6 py-3 font-medium hidden md:table-cell">Window</th>
                      <th scope="col" className="text-left px-6 py-3 font-medium hidden md:table-cell">Started</th>
                      <th scope="col" className="text-left px-6 py-3 font-medium hidden md:table-cell">Prices (₹)</th>
                      <th scope="col" className="text-left px-6 py-3 font-medium">Status</th>
                      <th scope="col" className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {activeShifts.map((shift) => (
                      <ShiftRow
                        key={shift.id}
                        shift={shift}
                        onClose={canCloseShift ? () => setShiftToClose(shift) : undefined}
                        onAddCredit={() => setShiftIdForCredit(shift.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            )}
          </div>

          {/* ── Shift History ──────────────────────────────────────────────── */}
          <div className="ui-card overflow-hidden p-0">
            {/* Header / toggle */}
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
            >
              <span className="text-base font-semibold text-slate-800">Shift History</span>
              <ChevronDown size={14} strokeWidth={2} className={`ui-accordion-arrow ${historyOpen ? 'ui-accordion-arrow--open' : ''}`} />
            </button>

            {historyOpen && (
              <div className="ui-accordion-content">
                {/* Tab row */}
                <div className="ui-tabbar">
                  {(['day', 'all', 'discrepancies'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setHistoryTab(tab)}
                      className={`ui-tabbar__button ${historyTab === tab ? 'ui-tabbar__button--active' : ''}`}
                    >
                      {tab === 'day' ? 'By Day' : tab === 'all' ? 'All Shifts' : 'Discrepancies'}
                    </button>
                  ))}
                </div>

                <div key={historyTab} className="ui-tab-content">
                  {!pumpId ? null : historyTab === 'day' ? (
                    <DayViewHistory pumpId={pumpId} />
                  ) : historyTab === 'all' ? (
                    <AllShiftsHistory pumpId={pumpId} />
                  ) : (
                    <DiscrepanciesHistory pumpId={pumpId} />
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {showOpenModal && pumpId && (
        <OpenShiftModal
          pumpId={pumpId}
          activeShifts={activeShifts}
          onClose={() => { setShowOpenModal(false); setClosedShiftPrefill(null) }}
          prefilledDuId={closedShiftPrefill?.duId}
          prefilledNozzleIds={closedShiftPrefill?.nozzleIds}
        />
      )}
      {showBackfillModal && pumpId && (
        <BackfillShiftModal
          pumpId={pumpId}
          onClose={() => setShowBackfillModal(false)}
        />
      )}
      {shiftToClose && (
        <CloseShiftModal
          shift={shiftToClose}
          onClose={() => setShiftToClose(null)}
          onShiftClosed={(duId, nozzleIds) => setClosedShiftPrefill({ duId, nozzleIds })}
        />
      )}
      {closedShiftPrefill && !showOpenModal && (
        <OpenNewShiftPrompt
          onConfirm={() => setShowOpenModal(true)}
          onDismiss={() => setClosedShiftPrefill(null)}
        />
      )}
      {shiftForCredit && (
        <AddCreditEntryModal
          shift={shiftForCredit}
          onClose={() => setShiftIdForCredit(null)}
        />
      )}
    </div>
  )
}
