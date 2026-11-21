import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Banknote, CreditCard, ClipboardCheck, Landmark, type LucideIcon } from 'lucide-react'
import { cashApi } from '../../../api/cashApi'
import { creditApi } from '../../../api/creditApi'
import { expenseApi } from '../../../api/expenseApi'
import { paymentSettlementApi } from '../../../api/paymentSettlementApi'
import { Reveal } from '../../../components/Reveal'
import { canPerformAction } from '../../../permissions/permissions'
import { useAuthStore } from '../../../store/authStore'
import { formatCurrency } from '../../../utils/format'

function MoneyTile({ to, icon: Icon, label, value, note }: {
  to: string
  icon: LucideIcon
  label: string
  value: string | undefined
  note: string
}) {
  return (
    <Link to={to} className="ui-dashboard-module block px-4 py-3.5 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{value ?? '—'}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </Link>
  )
}

/** The money figures an owner or manager checks first, each linking to the page where it is handled. */
export function MoneyOverview({ pumpId }: { pumpId: number }) {
  const role = useAuthStore((state) => state.user?.role)
  const canApprovePayments = canPerformAction('credit:approve-payment', role)

  const { data: cash } = useQuery({
    queryKey: ['cashEvents', pumpId, 'balance'],
    queryFn: () => cashApi.getCashEvents(pumpId, 0, 1),
  })
  const { data: clients } = useQuery({
    queryKey: ['credit-ledger', pumpId],
    queryFn: () => creditApi.getLedgerSummary(pumpId),
  })
  const { data: expenses } = useQuery({
    queryKey: ['expenses', pumpId, 'summary'],
    queryFn: () => expenseApi.getSummary(pumpId),
  })
  const { data: pendingPayments } = useQuery({
    queryKey: ['credit-pending-payments', pumpId],
    queryFn: () => creditApi.getPendingPayments(pumpId),
    enabled: canApprovePayments,
  })
  const { data: wallet } = useQuery({
    queryKey: ['settlements-wallet', pumpId],
    queryFn: () => paymentSettlementApi.getWallet(pumpId),
  })

  // Sub-account balances are already inside their parent's figure
  const creditOutstanding = clients
    ?.filter(client => client.parentClientId == null)
    .reduce((sum, client) => sum + client.outstandingBalance, 0)
  const waitingCount = expenses ? expenses.pendingCount + (pendingPayments?.length ?? 0) : undefined

  return (
    <Reveal delay={335}>
      <section aria-label="Money at a glance" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MoneyTile to="/dashboard/cash" icon={Banknote} label="Cash in drawer"
          value={cash ? formatCurrency(cash.currentBalance) : undefined} note="Current drawer balance" />
        <MoneyTile to="/dashboard/credit" icon={CreditCard} label="Credit outstanding"
          value={creditOutstanding != null ? formatCurrency(creditOutstanding) : undefined} note="Owed by credit clients" />
        <MoneyTile to="/dashboard/expenses" icon={ClipboardCheck} label="Waiting for approval"
          value={waitingCount != null ? String(waitingCount) : undefined}
          note={canApprovePayments ? 'Expenses and credit payments' : 'Expenses'} />
        <MoneyTile to="/dashboard/settlements" icon={Landmark} label="Not yet settled"
          value={wallet ? formatCurrency(wallet.totalPending) : undefined} note="UPI, card and fleet card" />
      </section>
    </Reveal>
  )
}
