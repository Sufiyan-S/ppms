import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { To } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { IndianRupee, Users } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { canAccessPage, canPerformAction } from '../../permissions/permissions'
import { usePumpStore } from '../../store/usePumpStore'
import { creditApi } from '../../api/creditApi'
import { pumpApi } from '../../api/pumpApi'
import { StatusBadge } from '../../components/StatusBadge'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { PageTabs } from '../../components/layout/PageTabs'
import { ListDetail } from '../../components/layout/ListDetail'
import { useActiveTab } from '../../components/layout/useActiveTab'
import { useUrlParam } from '../../components/layout/useUrlParam'
import { DESKTOP_QUERY } from '../../constants/breakpoints'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { ClientDetail } from './ClientDetail'
import { AgingTableTab } from './AgingTableTab'
import { AgingSummary } from './AgingSummary'
import { CreditAccountList } from './CreditAccountList'
import { CreditClientsTab } from './CreditClientsTab'
import { GenerateAllInvoicesModal } from './modals/GenerateAllInvoicesModal'
import { ChooseClientModal } from './modals/ChooseClientModal'
import { useCreditAging } from './useCreditAging'

const CREDIT_PATH = '/dashboard/credit'
const LEDGER_TABS = ['ledger', 'aging', 'clients'] as const
/** Belong to the open client, so they are left behind when going back to the list or to another client. */
const CLIENT_PARAMS = ['records', 'action', 'invoice'] as const

/**
 * Credit accounts. The ledger tab lists accounts beside the client in the path (/dashboard/credit/40), the aging
 * tab shows the same accounts as a table and the clients tab manages them. Filters stay in the address
 * (?filter=overdue&q=&sort=&dir=), and ?action=record-payment starts a payment, asking for the client when none is open.
 */
export default function CreditPage() {
  const { t } = useTranslation(['credit', 'common'])
  const { user } = useAuthStore()
  const role = user?.role
  const isOwnerOrAdmin    = role === 'OWNER' || role === 'ADMIN'
  const canSeeLedger      = canAccessPage('credit', role)
  const canAdjustLimit    = canPerformAction('credit:adjust-limit', role)
  const canManageClients  = canPerformAction('credit:manage-client', role)
  const canIssueInvoices  = canPerformAction('credit:issue-invoice', role)
  const canRecordPayment  = canPerformAction('credit:record-payment', role)

  const { selectedPumpId: pumpId } = usePumpStore()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const { clientId: clientIdParam } = useParams()
  const selectedClientId = clientIdParam && /^\d+$/.test(clientIdParam) ? Number(clientIdParam) : null
  const [searchParams] = useSearchParams()
  const requestedTab = useActiveTab(LEDGER_TABS, 'ledger')
  const activeTab = canSeeLedger ? requestedTab : 'clients'
  const paymentAction = useUrlParam('action')
  const [showGenerateAll, setShowGenerateAll] = useState(false)

  const agingView = useCreditAging(canSeeLedger ? pumpId : null)

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['credit-ledger', pumpId],
    queryFn: () => creditApi.getLedgerSummary(pumpId!),
    enabled: !!pumpId && canSeeLedger,
  })

  // The ledger endpoint may leave parentClientId empty, so the account count comes from the client list.
  const { data: allCreditClients = [] } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn:  () => pumpApi.getCreditClientAccounts(pumpId!),
    enabled:  !!pumpId,
  })

  if (!isOwnerOrAdmin && !pumpId) {
    return (
      <Page>
        <PageHeader title={t('page.titleLedger')} />
        <div className="ui-alert ui-alert-warning text-sm">
          {t('common:notices.notAssigned')}
        </div>
      </Page>
    )
  }

  const listSearch = (changes: Record<string, string | null> = {}) => {
    const params = new URLSearchParams(searchParams)
    for (const name of CLIENT_PARAMS) params.delete(name)
    Object.entries(changes).forEach(([name, value]) => (value === null ? params.delete(name) : params.set(name, value)))
    const search = params.toString()
    return search ? `?${search}` : ''
  }
  const linkToClient = (clientId: number): To => ({ pathname: `${CREDIT_PATH}/${clientId}`, search: listSearch() })
  const openClientInLedger = (clientId: number) =>
    navigate({ pathname: `${CREDIT_PATH}/${clientId}`, search: listSearch({ tab: null }) })
  const backToList = () => navigate({ pathname: CREDIT_PATH, search: listSearch() })
  const startPaymentFor = (clientId: number) => navigate(
    { pathname: `${CREDIT_PATH}/${clientId}`, search: listSearch({ tab: null, action: 'record-payment' }) },
    { replace: true },
  )

  const rootClientCount = allCreditClients.length > 0
    ? allCreditClients.filter(c => !c.parentClientId).length
    : clients.filter(c => !c.parentClientId).length
  const showPayerChoice = paymentAction.value === 'record-payment' && canRecordPayment && selectedClientId === null && !!pumpId
  const showSummary = activeTab !== 'clients' && agingView.aging && agingView.allRows.length > 0
    && (isDesktop || selectedClientId === null || activeTab === 'aging')
  const tabs = LEDGER_TABS.map(id => ({ id, label: t(`page.tabs.${id}`) }))

  return (
    <Page>
      <PageHeader
        title={canSeeLedger ? t('page.titleLedger') : t('page.titleClients')}
        description={canSeeLedger ? t('page.subtitleLedger') : t('page.subtitleClients')}
        badges={rootClientCount > 0 && (
          <StatusBadge tone="neutral" icon={Users} label={t('page.accountCount', { count: rootClientCount })} />
        )}
        secondaryActions={canIssueInvoices && pumpId && clients.length > 0 && (
          <button type="button" onClick={() => setShowGenerateAll(true)} className="ui-btn ui-btn-secondary">
            {t('aging.generateAllInvoices')}
          </button>
        )}
        primaryAction={canRecordPayment && pumpId && selectedClientId === null && (
          <button type="button" onClick={() => paymentAction.set('record-payment')} className="ui-btn ui-btn-primary inline-flex items-center gap-1.5">
            <IndianRupee size={14} strokeWidth={2.5} aria-hidden="true" />
            {t('clientActions.recordPayment')}
          </button>
        )}
        tabs={canSeeLedger && (
          <PageTabs label={t('page.views')} tabs={tabs} activeTab={activeTab} resetParams={CLIENT_PARAMS} />
        )}
      />

      {!pumpId ? (
        <div className="ui-card text-center text-sm text-ink-3">{t('common:notices.noPump')}</div>
      ) : (
        <>
          {showSummary && agingView.aging && <AgingSummary summary={agingView.aging.summary} />}

          {activeTab === 'ledger' && (
            <div className="ui-card p-0">
              <ListDetail
                listLabel={t('list.label')}
                detailLabel={t('list.detailLabel')}
                list={<CreditAccountList view={agingView} selectedClientId={selectedClientId} linkToClient={linkToClient} />}
                selectedId={selectedClientId}
                detail={selectedClientId !== null && (
                  <ClientDetail key={selectedClientId} clientId={selectedClientId} pumpId={pumpId} onBack={backToList} />
                )}
                placeholder={<p className="ui-empty">{t('list.selectClient')}</p>}
                onBack={backToList}
              />
            </div>
          )}

          {activeTab === 'aging' && (
            <PageSection title={t('aging.region')} flush>
              <AgingTableTab pumpId={pumpId} view={agingView} clients={clients}
                canAdjustLimit={canAdjustLimit} onOpenClient={openClientInLedger} />
            </PageSection>
          )}

          {activeTab === 'clients' && (
            <PageSection title={t('page.tabs.clients')}>
              <CreditClientsTab pumpId={pumpId} canManageClients={canManageClients}
                canManagePortalPins={canPerformAction('credit:manage-portal-pin', role)} />
            </PageSection>
          )}
        </>
      )}

      {showGenerateAll && pumpId && (
        <GenerateAllInvoicesModal pumpId={pumpId} onClose={() => setShowGenerateAll(false)} />
      )}
      {showPayerChoice && (
        <ChooseClientModal clients={clients} isLoading={clientsLoading} onChoose={startPaymentFor} onClose={paymentAction.remove} />
      )}
    </Page>
  )
}
