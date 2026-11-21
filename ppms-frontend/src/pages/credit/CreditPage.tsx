import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { canAccessPage, canPerformAction } from '../../permissions/permissions'
import { usePumpStore } from '../../store/usePumpStore'
import { creditApi } from '../../api/creditApi'
import type { CreditClient } from '../../api/creditApi'
import { pumpApi } from '../../api/pumpApi'
import { Reveal } from '../../components/Reveal'
import { ClientDetail } from './ClientDetail'
import { LedgerTab } from './LedgerTab'
import { CreditClientsTab } from './CreditClientsTab'
import { formatDecimal } from '../../utils/format'

// ─── Main Credit Page ────────────────────────────────────────────────────────

export default function CreditPage() {
  const { user } = useAuthStore()
  const isOwnerOrAdmin    = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canSeeLedger      = canAccessPage('credit', user?.role)
  const canAdjustLimit    = canPerformAction('credit:adjust-limit', user?.role)
  const canManageClients  = canPerformAction('credit:manage-client', user?.role)

  const { selectedPumpId } = usePumpStore()
  const [selectedClient, setSelectedClient] = useState<CreditClient | null>(null)

  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<'ledger' | 'clients'>(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'clients') return 'clients'
    return canSeeLedger ? 'ledger' : 'clients'
  })

  const pumpId = selectedPumpId

  const { data: clients = [], isLoading, error } = useQuery({
    queryKey: ['credit-ledger', pumpId],
    queryFn: () => creditApi.getLedgerSummary(pumpId!),
    enabled: !!pumpId && canSeeLedger,
  })

  // Fetch the full client list for reliable parentClientId / isParent structure.
  // The ledger endpoint may not populate parentClientId, so we use this for grouping.
  const { data: allCreditClients = [] } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn:  () => pumpApi.getCreditClients(pumpId!),
    enabled:  !!pumpId,
  })

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <div className="ui-page ui-page--narrow">
        <div className="ui-alert ui-alert-warning text-sm">
          You are not assigned to any pump. Ask the Owner or Admin to assign you.
        </div>
      </div>
    )
  }

  if (selectedClient && pumpId) {
    return (
      <div className="ui-page ui-page--narrow space-y-5">
        <ClientDetail
          clientId={selectedClient.id}
          pumpId={pumpId}
          onBack={() => setSelectedClient(null)}
        />
      </div>
    )
  }

  // Only sum root accounts — parent outstandingBalance already includes sub-account balances,
  // so adding sub-accounts separately would double-count them.
  const rootClients = clients.filter(c => c.parentClientId === null)
  const totalOutstanding = rootClients.reduce((sum, c) => sum + c.outstandingBalance, 0)
  const rootClientCount  = allCreditClients.length > 0
    ? allCreditClients.filter(c => !c.parentClientId).length
    : clients.filter(c => !c.parentClientId).length

  return (
    <div className="ui-page ui-page--narrow space-y-5">
      {/* Page header */}
      <Reveal delay={60}>
      <div className="ui-section-hero">
        <div>
          <p className="ui-section-kicker">{canSeeLedger ? 'Client balances' : 'Credit management'}</p>
          <h1 className="ui-title-sm">Credit {canSeeLedger ? 'Ledger' : 'Clients'}</h1>
          <p className="ui-subtitle">
            {canSeeLedger ? 'Track outstanding balances and record payments' : 'View credit client accounts'}
          </p>
        </div>
        <div className="ui-section-meta">
          <div className="ui-section-meta-pill">
            <span className="ui-section-meta-label">Accounts</span>
            <span className="ui-section-meta-value">{rootClientCount}</span>
          </div>
          {canSeeLedger && (
            <div className="ui-section-meta-pill">
              <span className="ui-section-meta-label">Outstanding</span>
              <span className="ui-section-meta-value">₹{formatDecimal(totalOutstanding)}</span>
            </div>
          )}
        </div>
      </div>
      </Reveal>

      {/* Tab bar — only shown for roles with ledger access */}
      {canSeeLedger && (
        <Reveal delay={100}>
        <div className="ui-tabbar w-fit">
          {(['clients', 'ledger'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`ui-tabbar__button ${activeTab === tab ? 'ui-tabbar__button--active' : ''}`}
            >
              {tab === 'clients' ? 'Clients' : 'Ledger'}
            </button>
          ))}
        </div>
        </Reveal>
      )}

      {/* ── Ledger tab ── */}
      {activeTab === 'ledger' && (
        <LedgerTab
          pumpId={pumpId}
          clients={clients}
          allCreditClients={allCreditClients}
          isLoading={isLoading}
          hasError={!!error}
          canAdjustLimit={canAdjustLimit}
          canIssueInvoices={canPerformAction('credit:issue-invoice', user?.role)}
          onSelectClient={setSelectedClient}
        />
      )}

      {/* ── Clients tab ── */}
      {activeTab === 'clients' && (
        <Reveal delay={120}>
        <div className="ui-card">
          {pumpId ? (
            <CreditClientsTab pumpId={pumpId} canManageClients={canManageClients}
              canManagePortalPins={canPerformAction('credit:manage-portal-pin', user?.role)} />
          ) : (
            <div className="ui-empty">No pump selected. Use the pump selector in the top navigation bar.</div>
          )}
        </div>
        </Reveal>
      )}
    </div>
  )
}
