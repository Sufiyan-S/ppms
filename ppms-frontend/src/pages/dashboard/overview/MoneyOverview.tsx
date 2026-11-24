import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, CreditCard, ClipboardCheck, Landmark, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cashApi } from '../../../api/cashApi'
import { creditApi } from '../../../api/creditApi'
import { expenseApi } from '../../../api/expenseApi'
import { paymentSettlementApi } from '../../../api/paymentSettlementApi'
import { LoadError } from '../../../components/LoadError'
import { Reveal } from '../../../components/Reveal'
import { canAccessPage, canPerformAction } from '../../../permissions/permissions'
import { useAuthStore } from '../../../store/authStore'
import { MoneyText } from '../../../components/AmountText'

function MoneyTile({ to, icon: Icon, label, value, note }: {
  to: string
  icon: LucideIcon
  label: string
  value: ReactNode
  note: string
}) {
  return (
    <Link to={to} className="ui-dashboard-module block min-w-0 px-4 py-3.5 transition-shadow hover:shadow-raised">
      <div className="ui-kpi-label flex items-center gap-2">
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="ui-money-tile-value mt-2 font-bold tabular-nums text-ink">{value ?? '—'}</p>
      <p className="mt-1 text-xs text-ink-3">{note}</p>
    </Link>
  )
}

/** The money figures an owner or manager checks first, each linking to the page where it is handled. */
export function MoneyOverview({ pumpId }: { pumpId: number }) {
  const { t } = useTranslation('dashboard')
  const role = useAuthStore((state) => state.user?.role)
  const canApprovePayments = canPerformAction('credit:approve-payment', role)

  const cashQuery = useQuery({
    queryKey: ['cashEvents', pumpId, 'balance'],
    queryFn: () => cashApi.getCashEvents(pumpId, 0, 1),
  })
  const clientsQuery = useQuery({
    queryKey: ['credit-ledger', pumpId],
    queryFn: () => creditApi.getLedgerSummary(pumpId),
  })
  const expensesQuery = useQuery({
    queryKey: ['expenses', pumpId, 'summary'],
    queryFn: () => expenseApi.getSummary(pumpId),
  })
  const pendingPaymentsQuery = useQuery({
    queryKey: ['credit-pending-payments', pumpId],
    queryFn: () => creditApi.getPendingPayments(pumpId),
    enabled: canApprovePayments,
  })
  const walletQuery = useQuery({
    queryKey: ['settlements-wallet', pumpId],
    queryFn: () => paymentSettlementApi.getWallet(pumpId),
  })

  const cash = cashQuery.data
  const clients = clientsQuery.data
  const expenses = expensesQuery.data
  const pendingPayments = pendingPaymentsQuery.data
  const wallet = walletQuery.data
  const failedQueries = [cashQuery, clientsQuery, expensesQuery, pendingPaymentsQuery, walletQuery].filter(query => query.isLoadingError)

  // Sub-account balances are already inside their parent's figure
  const creditOutstanding = clients
    ?.filter(client => client.parentClientId == null)
    .reduce((sum, client) => sum + client.outstandingBalance, 0)
  const waitingCount = expenses ? expenses.pendingCount + (pendingPayments?.length ?? 0) : undefined

  return (
    <Reveal delay={335}>
      <section aria-label={t('money.label')} className="grid grid-cols-1 min-[30rem]:grid-cols-2 lg:grid-cols-4 gap-4">
        {failedQueries.length > 0 && (
          <LoadError className="col-span-full" onRetry={() => failedQueries.forEach(query => void query.refetch())} />
        )}
        <MoneyTile to="/dashboard/cash" icon={Banknote} label={t('money.cashInDrawer')}
          value={cash ? <MoneyText value={cash.currentBalance} /> : undefined} note={t('money.cashNote')} />
        <MoneyTile to="/dashboard/credit" icon={CreditCard} label={t('money.creditOutstanding')}
          value={creditOutstanding != null ? <MoneyText value={creditOutstanding} /> : undefined} note={t('money.creditNote')} />
        <MoneyTile to={canAccessPage('approvals', role) ? '/dashboard/approvals' : '/dashboard/expenses'}
          icon={ClipboardCheck} label={t('money.waitingForApproval')}
          value={waitingCount}
          note={canApprovePayments ? t('money.waitingNoteWithPayments') : t('money.waitingNote')} />
        <MoneyTile to="/dashboard/settlements" icon={Landmark} label={t('money.notSettled')}
          value={wallet ? <MoneyText value={wallet.totalPending} /> : undefined} note={t('money.notSettledNote')} />
      </section>
    </Reveal>
  )
}
