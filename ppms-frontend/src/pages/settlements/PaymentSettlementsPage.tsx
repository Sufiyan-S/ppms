import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { paymentSettlementApi } from '../../api/paymentSettlementApi'
import type { Settlement, SettlementPaymentType } from '../../api/paymentSettlementApi'
import { Reveal } from '../../components/Reveal'
import { EmptyState } from '../../components/EmptyState'
import { RefreshIndicator } from '../../components/RefreshIndicator'
import { canPerformAction } from '../../permissions/permissions'
import { useSettlementHistory } from './useSettlementHistory'
import { WalletCards } from './WalletCards'
import { SettlementRecordsTab } from './SettlementRecordsTab'
import { SettlementConfigTab } from './SettlementConfigTab'
import { RecordSettlementDialog } from './RecordSettlementDialog'
import { VoidSettlementDialog } from './VoidSettlementDialog'

// ── Page ───────────────────────────────────────────────────────────────────

export default function PaymentSettlementsPage() {
  const { user }                   = useAuthStore()
  const { selectedPumpId: pumpId } = usePumpStore()

  const canWrite     = canPerformAction('settlement:write', user?.role)
  const canConfigure = canPerformAction('settlement:configure', user?.role)
  const canVoid      = canPerformAction('settlement:void', user?.role)

  const [activeTab, setActiveTab]   = useState<'records' | 'config'>('records')
  const [recordType, setRecordType] = useState<SettlementPaymentType | null>(null)
  const [voidTarget, setVoidTarget] = useState<Settlement | null>(null)

  const history = useSettlementHistory(pumpId)
  const { data: wallet, isLoading: loadingWallet } = useQuery({
    queryKey: ['settlements-wallet', pumpId],
    queryFn:  () => paymentSettlementApi.getWallet(pumpId!),
    enabled:  !!pumpId,
  })

  if (!pumpId) return <EmptyState icon="generic" title="Select a pump to view settlement records." />

  return (
    <Reveal>
      <div className="ui-page ui-page--narrow">

        {/* ── Header ── */}
        <div className="ui-page-header mb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="ui-title-sm">Payment Settlements</h1>
              <RefreshIndicator isFetching={history.fetchingList} dataUpdatedAt={history.listUpdatedAt ?? 0} />
            </div>
            <p className="ui-subtitle">
              Track when UPI, Card &amp; Fleet Card payments arrive in your bank account.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setRecordType('UPI')}
              className="ui-btn ui-btn-primary"
            >
              <Landmark size={16} strokeWidth={2} />
              Record Settlement
            </button>
          )}
        </div>

        <WalletCards wallet={wallet} loadingWallet={loadingWallet} canWrite={canWrite} onRecord={setRecordType} />

        {/* ── Tabs ── */}
        <div className="flex gap-0 mb-5 border-b border-slate-200">
          {(['records', 'config'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab === 'records' ? 'Settlement History' : 'Alert Settings'}
            </button>
          ))}
        </div>

        {activeTab === 'records' && (
          <SettlementRecordsTab history={history} canVoid={canVoid} onVoid={setVoidTarget} />
        )}

        {activeTab === 'config' && (
          <SettlementConfigTab pumpId={pumpId} canConfigure={canConfigure} />
        )}
      </div>

      {recordType && (
        <RecordSettlementDialog
          pumpId={pumpId}
          wallet={wallet}
          initialType={recordType}
          onClose={() => setRecordType(null)}
        />
      )}

      {voidTarget && (
        <VoidSettlementDialog pumpId={pumpId} voidTarget={voidTarget} onClose={() => setVoidTarget(null)} />
      )}
    </Reveal>
  )
}
