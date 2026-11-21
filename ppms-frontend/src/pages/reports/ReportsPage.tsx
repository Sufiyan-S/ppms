import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Reveal } from '../../components/Reveal'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { pumpApi } from '../../api/pumpApi'
import { DipPlTab } from './tabs/DipPlTab'
import { DiscrepancyTab } from './tabs/DiscrepancyTab'
import { ExpensesTab } from './tabs/ExpensesTab'
import { InterestAccrualTab } from './tabs/InterestAccrualTab'
import { InventoryLotsTab } from './tabs/InventoryLotsTab'
import { OperatorDutyTab } from './tabs/OperatorDutyTab'
import { ProfitLossTab } from './tabs/ProfitLossTab'
import { ShiftsTab } from './tabs/ShiftsTab'
import { fmtDateTime } from './reportFormat'

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'pl' | 'duty' | 'discrepancy' | 'inventory' | 'dip' | 'shifts' | 'expenses' | 'interest'

const MANAGER_TABS: Tab[] = ['duty', 'discrepancy', 'shifts']

export default function ReportsPage() {
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isManager = user?.role === 'MANAGER'

  const [tab, setTab] = useState<Tab>(isManager ? 'duty' : 'pl')
  const { selectedPumpId } = usePumpStore()

  const pumpId = selectedPumpId

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn: () => pumpApi.getMyPumps(),
  })

  const pumpName = pumpId ? (pumps.find(p => p.id === pumpId)?.name ?? '') : ''
  const userName = user?.fullName ?? ''

  const ALL_TABS: { id: Tab; label: string }[] = [
    { id: 'pl',          label: 'Profit & Loss' },
    { id: 'duty',        label: 'Operator Duty' },
    { id: 'discrepancy', label: 'Short / Over' },
    { id: 'inventory',   label: 'Inventory Lots' },
    { id: 'dip',         label: 'Dip P/L' },
    { id: 'shifts',      label: 'Shifts' },
    { id: 'expenses',    label: 'Expenses' },
    { id: 'interest',    label: 'Interest Accrual' },
  ]

  const TABS = isManager
    ? ALL_TABS.filter(t => MANAGER_TABS.includes(t.id))
    : ALL_TABS

  // If the current tab is not visible to this role, reset to the first allowed tab
  const activeTab = TABS.some(t => t.id === tab) ? tab : TABS[0]?.id ?? 'duty'

  if (!pumpId && !isOwnerOrAdmin && !isManager) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning text-sm">
          You are not assigned to any pump. Ask the Owner or Admin to assign you.
        </div>
      </div>
    )
  }

  return (
    <div className="ui-page ui-page--narrow space-y-5">
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">Analysis</p>
          <h1 className="ui-title-sm">Reports</h1>
          <p className="ui-subtitle print:hidden">Operational and financial reports for your pump.</p>
          <p className="hidden print:block text-xs text-slate-500 mt-0.5">
            {pumpName && <><span className="font-medium">{pumpName}</span> · </>}
            {userName && <>Printed by: <span className="font-medium">{userName}</span> · </>}
            <span className="text-slate-500">{fmtDateTime(new Date().toISOString())}</span>
          </p>
        </div>
      </div>
      </Reveal>

      {!pumpId ? (
        <div className="ui-empty">
          No pump selected. Use the pump selector in the top navigation bar.
        </div>
      ) : (
        <div className="ui-card p-0 overflow-hidden">
          {/* Tabs — hidden when printing */}
          <div className="ui-tabbar print:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`ui-tabbar__button ${
                  activeTab === t.id
                    ? 'ui-tabbar__button--active'
                    : ''
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div key={activeTab} className="p-5 ui-tab-content">
            {activeTab === 'pl'          && <ProfitLossTab          pumpId={pumpId} />}
            {activeTab === 'duty'        && <OperatorDutyTab        pumpId={pumpId} />}
            {activeTab === 'discrepancy' && <DiscrepancyTab         pumpId={pumpId} />}
            {activeTab === 'inventory'   && <InventoryLotsTab       pumpId={pumpId} />}
            {activeTab === 'dip'         && <DipPlTab               pumpId={pumpId} />}
            {activeTab === 'shifts'      && <ShiftsTab              pumpId={pumpId} />}
            {activeTab === 'expenses'    && <ExpensesTab            pumpId={pumpId} />}
            {activeTab === 'interest'    && <InterestAccrualTab     pumpId={pumpId} />}
          </div>
        </div>
      )}

    </div>
  )
}
