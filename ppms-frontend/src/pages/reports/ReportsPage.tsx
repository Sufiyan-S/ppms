import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { pumpApi } from '../../api/pumpApi'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageTabs } from '../../components/layout/PageTabs'
import { useActiveTab } from '../../components/layout/useActiveTab'
import { DipPlTab } from './tabs/DipPlTab'
import { DiscrepancyTab } from './tabs/DiscrepancyTab'
import { ExpensesTab } from './tabs/ExpensesTab'
import { InterestAccrualTab } from './tabs/InterestAccrualTab'
import { InventoryLotsTab } from './tabs/InventoryLotsTab'
import { OperatorDutyTab } from './tabs/OperatorDutyTab'
import { ProfitLossTab } from './tabs/ProfitLossTab'
import { ShiftsTab } from './tabs/ShiftsTab'
import { fmtDateTime } from './reportFormat'

type Tab = 'pl' | 'duty' | 'discrepancy' | 'inventory' | 'dip' | 'shifts' | 'expenses' | 'interest'

const ALL_TAB_IDS: Tab[] = ['pl', 'duty', 'discrepancy', 'inventory', 'dip', 'shifts', 'expenses', 'interest']
const MANAGER_TAB_IDS: Tab[] = ['duty', 'discrepancy', 'shifts']

export default function ReportsPage() {
  const { t } = useTranslation(['reports', 'common'])
  const { user } = useAuthStore()
  const isOwnerOrAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const isManager = user?.role === 'MANAGER'
  const { selectedPumpId: pumpId } = usePumpStore()

  const { data: pumps = [] } = useQuery({
    queryKey: ['myPumps'],
    queryFn: () => pumpApi.getMyPumps(),
  })

  const pumpName = pumpId ? (pumps.find(p => p.id === pumpId)?.name ?? '') : ''
  const userName = user?.fullName ?? ''
  const tabIds = isManager ? MANAGER_TAB_IDS : ALL_TAB_IDS
  const tabs = tabIds.map((id) => ({ id, label: t(`page.tabs.${id}`) }))
  const activeTab = useActiveTab(tabIds, tabIds[0])

  if (!pumpId && !isOwnerOrAdmin && !isManager) {
    return (
      <Page>
        <div className="ui-alert ui-alert-warning text-sm">
          {t('common:notices.notAssigned')}
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={<span className="print:hidden">{t('page.subtitle')}</span>}
        tabs={pumpId && <PageTabs label={t('page.tabsLabel')} tabs={tabs} activeTab={activeTab} />}
      />
      <p className="hidden print:block text-xs text-ink-3">
        {pumpName && <><span className="font-medium">{pumpName}</span> · </>}
        {userName && <>{t('page.printedBy')} <span className="font-medium">{userName}</span> · </>}
        {fmtDateTime(new Date().toISOString())}
      </p>

      {!pumpId ? (
        <div className="ui-empty">
          {t('common:notices.noPump')}
        </div>
      ) : (
        <div key={activeTab} className="ui-tab-content">
          {activeTab === 'pl'          && <ProfitLossTab          pumpId={pumpId} />}
          {activeTab === 'duty'        && <OperatorDutyTab        pumpId={pumpId} />}
          {activeTab === 'discrepancy' && <DiscrepancyTab         pumpId={pumpId} />}
          {activeTab === 'inventory'   && <InventoryLotsTab       pumpId={pumpId} />}
          {activeTab === 'dip'         && <DipPlTab               pumpId={pumpId} />}
          {activeTab === 'shifts'      && <ShiftsTab              pumpId={pumpId} />}
          {activeTab === 'expenses'    && <ExpensesTab            pumpId={pumpId} />}
          {activeTab === 'interest'    && <InterestAccrualTab     pumpId={pumpId} />}
        </div>
      )}
    </Page>
  )
}
