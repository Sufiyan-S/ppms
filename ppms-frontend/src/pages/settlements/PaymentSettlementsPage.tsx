import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Landmark } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { Settlement, SettlementPaymentType } from '../../api/paymentSettlementApi'
import { EmptyState } from '../../components/EmptyState'
import { canPerformAction } from '../../permissions/permissions'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'
import { PageTabs } from '../../components/layout/PageTabs'
import { useActiveTab } from '../../components/layout/useActiveTab'
import { useUrlParam } from '../../components/layout/useUrlParam'
import { useSettlementHistory } from './useSettlementHistory'
import { WalletCards } from './WalletCards'
import { SettlementRecordsTab } from './SettlementRecordsTab'
import { SettlementConfigTab } from './SettlementConfigTab'
import { RecordSettlementDialog } from './RecordSettlementDialog'
import { VoidSettlementDialog } from './VoidSettlementDialog'
import { PendingByAgeCard } from './PendingByAgeCard'
import { SettlementDetailsPanel } from './SettlementDetailsPanel'

const TAB_IDS = ['records', 'config'] as const

/**
 * Money collected by UPI, card and fleet card until it reaches the bank. The address holds the tab (?tab=config),
 * an open settlement (?settlement=12) and the record form (?action=record-settlement).
 */
export default function PaymentSettlementsPage() {
  const { t } = useTranslation('settlements')
  const { user }                   = useAuthStore()
  const { selectedPumpId: pumpId } = usePumpStore()

  const canWrite     = canPerformAction('settlement:write', user?.role)
  const canConfigure = canPerformAction('settlement:configure', user?.role)
  const canVoid      = canPerformAction('settlement:void', user?.role)

  const activeTab = useActiveTab(TAB_IDS, 'records')
  const recordAction = useUrlParam('action')
  const openSettlement = useUrlParam('settlement')
  const [recordType, setRecordType] = useState<SettlementPaymentType>('UPI')
  const [voidTarget, setVoidTarget] = useState<Settlement | null>(null)

  const history = useSettlementHistory(pumpId)
  const { data: wallet, isLoading: loadingWallet } = useQuery({
    queryKey: ['settlements-wallet', pumpId],
    queryFn:  () => paymentSettlementApi.getWallet(pumpId!),
    enabled:  !!pumpId,
  })

  const pendingByAge = useQuery({
    queryKey: ['settlements-pending-age', pumpId],
    queryFn:  () => paymentSettlementApi.getPendingByAge(pumpId!),
    enabled:  !!pumpId,
  })

  if (!pumpId) {
    return (
      <Page>
        <PageHeader title={t('page.title')} />
        <EmptyState icon="generic" title={t('page.noPump')} />
      </Page>
    )
  }

  const openRecordForm = (type: SettlementPaymentType) => {
    setRecordType(type)
    recordAction.set('record-settlement')
  }
  const startVoid = (settlement: Settlement) => {
    openSettlement.remove()
    setVoidTarget(settlement)
  }
  const shownSettlement = history.dailySummary
    .flatMap(entry => entry.settlements)
    .find(settlement => String(settlement.id) === openSettlement.value)
  const tabs = TAB_IDS.map(id => ({ id, label: id === 'records' ? t('page.historyTab') : t('page.alertsTab') }))

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        primaryAction={canWrite && (
          <button type="button" onClick={() => openRecordForm('UPI')} className="ui-btn ui-btn-primary">
            <Landmark size={16} strokeWidth={2} aria-hidden="true" />
            {t('page.record')}
          </button>
        )}
        tabs={<PageTabs label={t('page.views')} tabs={tabs} activeTab={activeTab} resetParams={['settlement']} />}
      />

      {activeTab === 'records' ? (
        <>
          <WalletCards wallet={wallet} loadingWallet={loadingWallet} canWrite={canWrite} onRecord={openRecordForm} />
          <PendingByAgeCard ranges={pendingByAge.data} isLoading={pendingByAge.isLoading} error={pendingByAge.error} />
          <SettlementRecordsTab history={history} canVoid={canVoid} onVoid={startVoid}
            onOpenDetails={settlement => openSettlement.set(String(settlement.id))} />
        </>
      ) : (
        <PageSection title={t('page.alertsTab')} description={t('alerts.intro')}>
          <SettlementConfigTab pumpId={pumpId} canConfigure={canConfigure} />
        </PageSection>
      )}

      {recordAction.value === 'record-settlement' && canWrite && (
        <RecordSettlementDialog
          pumpId={pumpId}
          wallet={wallet}
          pendingRanges={pendingByAge.data ?? []}
          initialType={recordType}
          onClose={recordAction.remove}
        />
      )}

      {shownSettlement && (
        <SettlementDetailsPanel settlement={shownSettlement} canVoid={canVoid} onVoid={startVoid} onClose={openSettlement.remove} />
      )}

      {voidTarget && (
        <VoidSettlementDialog pumpId={pumpId} voidTarget={voidTarget} onClose={() => setVoidTarget(null)} />
      )}
    </Page>
  )
}
