import { useState } from 'react'
import { serverText } from '../../utils/serverText'
import { useTranslation } from 'react-i18next'
import { withToggled } from '../../utils/setToggle'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/authStore'
import { creditApi } from '../../api/creditApi'
import type { CreditExtension, CreditTransaction } from '../../api/creditApi'
import { Pagination } from '../../components/Pagination'
import { canPerformAction } from '../../permissions/permissions'
import { SkeletonRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { useToastStore } from '../../store/toastStore'
import { parseApiError } from '../../utils/apiError'
import { IconButton } from '../../components/IconButton'
import { RejectReasonDialog } from '../../components/RejectReasonDialog'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { codeLabel } from '../../constants/labels'
import { ClientActions } from './ClientActions'
import { ActiveExtensionBanners } from './ActiveExtensionBanners'
import { GrantExtensionModal } from './modals/GrantExtensionModal'
import { RevokeExtensionModal } from './modals/RevokeExtensionModal'
import { buildWeekGroups } from './ledgerGroups'
import { LedgerWeekGroups } from './LedgerWeekGroups'
import type { LedgerRowActions } from './LedgerWeekGroups'
import { ReassignCreditEntryModal } from './modals/ReassignCreditEntryModal'
import { RecordPaymentModal } from './modals/RecordPaymentModal'
import { StatementModal } from './modals/StatementModal'
import { SetInterestSettingsModal } from './modals/SetInterestSettingsModal'
import { WaiveInterestModal } from './modals/WaiveInterestModal'
import { useClientLedger } from './useClientLedger'
import { useLedgerFilters } from './useLedgerFilters'
import { LedgerFilterBar } from './LedgerFilterBar'
import { ClientSummaryCards } from './ClientSummaryCards'
import { ClientInvoicesTab } from './ClientInvoicesTab'
import { formatCurrency } from '../../utils/format'
import { PageTabs } from '../../components/layout/PageTabs'
import { useActiveTab } from '../../components/layout/useActiveTab'
import { useUrlParam } from '../../components/layout/useUrlParam'

const RECORD_TABS = ['ledger', 'invoices'] as const

interface ClientDetailProps {
  clientId: number
  pumpId: number
  onBack: () => void
}

/**
 * One client's ledger and invoices with their actions. ?records=invoices picks the tab and
 * ?action=record-payment opens Record payment, so the command palette and links can start there.
 */
export function ClientDetail({ clientId, pumpId, onBack }: ClientDetailProps) {
  const { t } = useTranslation('credit')
  const paymentAction = useUrlParam('action')
  const [showInterestSettingsModal, setShowInterestSettingsModal] = useState(false)
  const [showExtensionModal, setShowExtensionModal] = useState(false)
  const [showStatementModal, setShowStatementModal] = useState(false)
  const [revokingExtension, setRevokingExtension] = useState<CreditExtension | null>(null)
  const [applyInterestFeedback, setApplyInterestFeedback] = useState<string | null>(null)
  const [reassignEntryId,         setReassignEntryId]         = useState<number | null>(null)
  // Track which client the entry being reassigned belongs to (may be a child in parent view)
  const [reassignSourceClientId,  setReassignSourceClientId]  = useState<number>(clientId)
  const [reassignType,            setReassignType]            = useState<'SALE' | 'PAYMENT'>('SALE')
  const [rejectingPayment, setRejectingPayment] = useState<CreditTransaction | null>(null)
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [waivingInterest, setWaivingInterest] = useState<{ charge: CreditTransaction; sourceClientId: number } | null>(null)
  // Tracks which sections are expanded in the parent ledger view.
  // 'own' (parent's own transactions) starts expanded; sub-account sections start collapsed.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['own']))
  const toggleSection = (key: string) =>
    setExpandedSections(prev => withToggled(prev, key))
  const qc = useQueryClient()

  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const role = user?.role
  const canApprovePayments = canPerformAction('credit:approve-payment', role)
  const canMoveEntries     = canPerformAction('credit:reassign', role)
  const canManageInterestForRole = canPerformAction('credit:manage-interest', role)
  const canApplyInterestForRole  = canPerformAction('credit:apply-interest', role)
  const canWaiveInterest   = canPerformAction('credit:waive-interest', role)
  const canManageExtensions = canPerformAction('credit:grant-extension', role)
  const canIssueInvoices   = canPerformAction('credit:issue-invoice', role)
  const activeTab = useActiveTab(RECORD_TABS, 'ledger', 'records')
  const [txPage, setTxPage] = useState(0)
  const [txPageSize, setTxPageSize] = useState(10)

  const {
    allClients, client, clientsLoading, clientsFailed, childClients, activeExtensions, ownTransactions, isLoading,
    outstandingInterest, totalInterestRecovered, childTransactionsByIndex,
    pendingPaymentRecorders, transactions,
  } = useClientLedger(pumpId, clientId, canApprovePayments)

  // Interest is charged on the parent for the whole group, so a sub-account has no interest actions of its own.
  const isSubAccount = client?.parentClientId != null
  const canManageInterest = canManageInterestForRole && !isSubAccount
  const canApplyInterest = canApplyInterestForRole && !isSubAccount
  // Limits and billing cycles are checked on the parent, so extensions are granted there too.
  const canGrantExtension = canManageExtensions && !isSubAccount

  const invalidateLedger = () => {
    qc.invalidateQueries({ queryKey: ['credit-transactions', pumpId] })
    qc.invalidateQueries({ queryKey: ['credit-ledger', pumpId] })
    qc.invalidateQueries({ queryKey: ['credit-pending-payments', pumpId] })
  }

  const applyInterestMutation = useMutation({
    mutationFn: () => creditApi.applyInterest(pumpId, clientId),
    onSuccess: (result) => {
      invalidateLedger()
      if (result.applied) {
        setApplyInterestFeedback(t('detail.interestApplied', {
          amount: `₹${result.amount?.toFixed(2)}`, days: result.days, from: result.periodFrom, to: result.periodTo,
        }))
      } else {
        setApplyInterestFeedback(result.reason ? serverText(result.reasonCode, result.reasonParams, result.reason) : t('detail.noInterestApplicable'))
      }
    },
    onError: (err) => setApplyInterestFeedback(parseApiError(err, t('detail.applyInterestFailed'))),
  })

  const approvePaymentMutation = useMutation({
    mutationFn: ({ paymentId, status, reason }: { paymentId: number; status: 'APPROVED' | 'REJECTED'; reason?: string }) =>
      creditApi.approvePayment(pumpId, paymentId, status, reason),
    onSuccess: (_payment, { status }) => {
      invalidateLedger()
      setRejectingPayment(null)
      addToast(status === 'APPROVED' ? t('detail.paymentApproved') : t('detail.paymentRejected'), 'success')
    },
    onError: (err, { status }) => {
      const message = parseApiError(err, t('detail.paymentUpdateFailed'))
      if (status === 'REJECTED') setRejectError(message)
      else addToast(message, 'error')
    },
  })

  const ledgerFilters = useLedgerFilters(transactions, ownTransactions, childTransactionsByIndex, txPage, txPageSize)
  const { filtered, pagedFiltered, weekGroups, childFilteredTxs, filteredOwn } = ledgerFilters

  // The server balance already counts sub-accounts for a parent; pending payments are not yet in it.
  const pendingPaymentTotal = transactions
    .filter(tx => tx.type === 'PAYMENT' && tx.status === 'PENDING_APPROVAL')
    .reduce((sum, tx) => sum + tx.amount, 0)
  const effectiveOutstandingBalance = client
    ? Math.max(0, Math.round((client.outstandingBalance - pendingPaymentTotal) * 100) / 100)
    : 0
  const canRecordPayment = !!client && canPerformAction('credit:record-payment', role) && (
    effectiveOutstandingBalance > 0 ||
    (client.isParent && childClients.length > 0)
  )

  const rowActions: LedgerRowActions = {
    canMoveEntries,
    canWaiveInterest,
    canApprovePayments,
    currentUserId: user?.userId,
    pendingPaymentRecorders,
    approvePayment: (paymentId) => approvePaymentMutation.mutate({ paymentId, status: 'APPROVED' }),
    onRejectPayment: (payment) => {
      setRejectError(null)
      setRejectingPayment(payment)
    },
    isApproving: approvePaymentMutation.isPending,
    onMove: (entryId, sourceClientId, type) => {
      setReassignEntryId(entryId)
      setReassignSourceClientId(sourceClientId)
      setReassignType(type)
    },
    onWaiveInterest: (charge, sourceClientId) => setWaivingInterest({ charge, sourceClientId }),
  }

  const showPaymentModal = paymentAction.value === 'record-payment' && canRecordPayment

  if (!client) {
    if (clientsLoading) return <div className="px-5 py-4"><SkeletonRows count={4} /></div>
    return (
      <div className="space-y-4">
        <p className="ui-alert ui-alert-error text-sm" role="alert">
          {clientsFailed ? t('detail.loadFailed') : t('detail.notFound')}
        </p>
        <button type="button" onClick={onBack} className="ui-btn ui-btn-secondary">{t('detail.back')}</button>
      </div>
    )
  }

  return (
    <div>
      {showPaymentModal && (
        <RecordPaymentModal
          client={client}
          pumpId={pumpId}
          outstandingBalanceOverride={effectiveOutstandingBalance}
          subClients={allClients.filter(c => c.parentClientId === clientId)}
          onClose={paymentAction.remove}
        />
      )}
      {reassignEntryId !== null && canMoveEntries && (
        <ReassignCreditEntryModal
          entryId={reassignEntryId}
          currentClientId={reassignSourceClientId}
          pumpId={pumpId}
          transactionType={reassignType}
          onClose={() => { setReassignEntryId(null) }}
        />
      )}
      {showInterestSettingsModal && (
        <SetInterestSettingsModal
          client={client}
          pumpId={pumpId}
          onClose={() => setShowInterestSettingsModal(false)}
        />
      )}
      {waivingInterest && canWaiveInterest && (
        <WaiveInterestModal
          pumpId={pumpId}
          clientId={waivingInterest.sourceClientId}
          charge={waivingInterest.charge}
          onWaived={() => { invalidateLedger(); addToast(t('detail.interestWaived'), 'success') }}
          onClose={() => setWaivingInterest(null)}
        />
      )}
      {rejectingPayment && (
        <RejectReasonDialog
          title={t('detail.rejectPayment')}
          subtitle={`${formatCurrency(rejectingPayment.amount)} · ${rejectingPayment.reference || codeLabel(rejectingPayment.detail)}`}
          isPending={approvePaymentMutation.isPending}
          error={rejectError}
          onConfirm={(reason) => approvePaymentMutation.mutate({
            paymentId: rejectingPayment.referenceId, status: 'REJECTED', reason,
          })}
          onClose={() => setRejectingPayment(null)}
        />
      )}
      {showExtensionModal && canGrantExtension && (
        <GrantExtensionModal
          client={client}
          pumpId={pumpId}
          onClose={() => setShowExtensionModal(false)}
        />
      )}
      {revokingExtension && canManageExtensions && (
        <RevokeExtensionModal
          pumpId={pumpId}
          extension={revokingExtension}
          onClose={() => setRevokingExtension(null)}
        />
      )}

      {showStatementModal && (
        <StatementModal
          pumpId={pumpId}
          clientId={client.id}
          clientName={client.name}
          phone={client.phone}
          outstanding={effectiveOutstandingBalance}
          onClose={() => setShowStatementModal(false)}
        />
      )}

      <div className="pb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink">{client.name}</h2>
            <p className="text-sm text-ink-3 mt-0.5">{client.phone}</p>
          </div>
          <ClientActions
            canManageInterest={canManageInterest}
            canApplyInterest={canApplyInterest && client.monthlyInterestRate > 0 && client.outstandingBalance > 0}
            isApplyingInterest={applyInterestMutation.isPending}
            canGrantExtension={canGrantExtension}
            canRecordPayment={canRecordPayment}
            onOpenInterestSettings={() => setShowInterestSettingsModal(true)}
            onApplyInterest={() => { setApplyInterestFeedback(null); applyInterestMutation.mutate() }}
            onGrantExtension={() => setShowExtensionModal(true)}
            onRecordPayment={() => paymentAction.set('record-payment')}
            onOpenStatement={() => setShowStatementModal(true)}
          />
        </div>

        {canManageInterestForRole && isSubAccount && (
          <p className="mt-3 ui-card-plain px-4 py-2.5 text-sm text-ink-3">
            {client.parentClientName
              ? t('detail.interestOnParentNamed', { name: client.parentClientName })
              : t('detail.interestOnParent')}
          </p>
        )}
        {canManageExtensions && isSubAccount && (
          <p className="mt-3 ui-card-plain px-4 py-2.5 text-sm text-ink-3">
            {client.parentClientName
              ? t('detail.limitOnParentNamed', { name: client.parentClientName })
              : t('detail.limitOnParent')}
          </p>
        )}
        {applyInterestFeedback && (
          <div className="mt-3 ui-alert text-sm bg-info-bg border-info/30 text-info flex items-center justify-between">
            <span>{applyInterestFeedback}</span>
            <IconButton onClick={() => setApplyInterestFeedback(null)} className="ml-2 text-info hover:text-ink"
              label={t('detail.dismissMessage')}
              icon={'×'}
            />
          </div>
        )}
        {canManageInterest && client.monthlyInterestRate === 0 && client.outstandingBalance > 0 && (
          <div className="mt-3 ui-card-plain px-4 py-2.5 text-sm text-ink-3 flex items-center gap-2">
            <span>{t('detail.noInterestRate')}</span>
            <button
              onClick={() => setShowInterestSettingsModal(true)}
              className="text-primary font-medium hover:text-primary-strong underline-offset-2 hover:underline"
            >
              {t('detail.setInterestRate')}
            </button>
          </div>
        )}

        <ActiveExtensionBanners extensions={activeExtensions} canRevoke={canManageExtensions} onRevoke={setRevokingExtension} />
      </div>

      <ClientSummaryCards
        client={client}
        hasSubAccounts={client.isParent && childClients.length > 0}
        outstandingBalance={client.outstandingBalance}
        pendingApprovalTotal={pendingPaymentTotal}
        outstandingInterest={outstandingInterest}
        totalInterestRecovered={totalInterestRecovered}
        transactionCount={transactions.length}
        canManageInterest={canManageInterest}
        onOpenInterestSettings={() => setShowInterestSettingsModal(true)}
      />

      <div className="mb-4">
        <PageTabs
          label={t('detail.recordsLabel')}
          tabs={RECORD_TABS.map(tab => ({ id: tab, label: t(`detail.tabs.${tab}`) }))}
          activeTab={activeTab}
          param="records"
          resetParams={['invoice']}
        />
      </div>

      {activeTab === 'invoices' && (
        <div>
          <ClientInvoicesTab pumpId={pumpId} clientId={clientId} canIssueInvoices={canIssueInvoices} />
        </div>
      )}

      {/* Transaction ledger */}
      {activeTab === 'ledger' && (
      <div>
        <LedgerFilterBar filters={ledgerFilters} />

        {isLoading ? (
          <div className="px-5 py-4"><SkeletonRows count={5} /></div>
        ) : client.isParent ? (
          /* ── Parent view: parent's own transactions first, then sub-accounts ── */
          <div className="space-y-8">
            {/* Parent's own transactions — expanded by default */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('own')}
                className="w-full flex items-center justify-between mb-3 pb-2 border-b border-border hover:bg-surface-sunken rounded-control px-1 -mx-1 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-full bg-surface-sunken text-ink-2 text-xs font-bold flex items-center justify-center">
                    {client.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{client.name}</span>
                      <StatusBadge tone="neutral" label={t('detail.ownTransactions')} />
                    </div>
                    <p className="text-xs text-ink-3">{client.phone}</p>
                  </div>
                </div>
                <svg
                  className={`w-4 h-4 text-ink-3 transition-transform ${expandedSections.has('own') ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedSections.has('own') && (
                filteredOwn.length === 0 ? (
                  <div className="ui-empty py-4">
                    {ownTransactions.length === 0 ? t('detail.noOwnTransactions') : t('detail.noFilterMatch')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <LedgerWeekGroups groups={buildWeekGroups(filteredOwn as CreditTransaction[])} srcClientId={clientId} actions={rowActions} />
                  </div>
                )
              )}
            </div>

            {/* Sub-account sections — collapsed by default */}
            {childClients.map((child, i) => {
              const sectionKey       = String(child.id)
              const isExpanded       = expandedSections.has(sectionKey)
              const childFiltered    = childFilteredTxs[i]
              const childGroups      = buildWeekGroups(childFiltered)
              const childLedger      = allClients.find(c => c.id === child.id)
              const childOutstanding = childLedger?.outstandingBalance ?? 0
              return (
                <div key={child.id}>
                  <button
                    type="button"
                    onClick={() => toggleSection(sectionKey)}
                    className="w-full flex items-center justify-between mb-3 pb-2 border-b border-border hover:bg-surface-sunken rounded-control px-1 -mx-1 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-info-bg text-primary text-xs font-bold flex items-center justify-center">
                        {child.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{child.name}</span>
                          <StatusBadge tone="info" label={t('detail.subAccount')} />
                        </div>
                        <p className="text-xs text-ink-3">{child.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-ink-3">{t('summaryCards.outstanding')}</p>
                        <MoneyText value={childOutstanding} tone={childOutstanding > 0 ? 'warn' : 'ok'} className="block text-sm font-bold" />
                      </div>
                      <svg
                        className={`w-4 h-4 text-ink-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  {isExpanded && (
                    isLoading ? (
                      <div className="px-4 py-3"><SkeletonRows count={3} /></div>
                    ) : childFiltered.length === 0 ? (
                      <EmptyState
                        icon="transactions"
                        title={(childTransactionsByIndex[i] ?? []).length === 0 ? t('detail.noTransactionsTitle') : t('detail.noFilterMatchTitle')}
                      />
                    ) : (
                      <div className="space-y-3"><LedgerWeekGroups groups={childGroups} srcClientId={child.id} actions={rowActions} /></div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        ) : filtered.length === 0 ? (
          <div className="ui-empty py-8">
            {transactions.length === 0 ? t('detail.noTransactions') : t('detail.noFilterMatch')}
          </div>
        ) : (
          <>
            <div className="space-y-4"><LedgerWeekGroups groups={weekGroups} srcClientId={clientId} actions={rowActions} /></div>
            <Pagination
              data={pagedFiltered}
              onPageChange={setTxPage}
              onPageSizeChange={size => { setTxPageSize(size); setTxPage(0) }}
            />
          </>
        )}
      </div>
      )}
    </div>
  )
}
