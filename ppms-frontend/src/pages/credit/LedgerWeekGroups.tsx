import type { CreditTransaction } from '../../api/creditApi'
import { formatIstDate } from '../../utils/date'
import { formatDecimal } from '../../utils/format'
import { ConfirmButton } from '../../components/ConfirmButton'
import { ScrollRegion } from '../../components/ScrollRegion'
import { codeLabel } from '../../constants/labels'
import { FUEL_LABELS } from '../../constants/fuel'

const formatDate = (iso: string) =>
  formatIstDate(iso, { day: '2-digit', month: 'short' })

export interface LedgerRowActions {
  canMoveEntries: boolean
  canDeleteInterest: boolean
  canApprovePayments: boolean
  currentUserId: number | undefined
  pendingPaymentRecorders: Map<number, number>
  approvePayment: (paymentId: number, status: 'APPROVED' | 'REJECTED') => void
  isApproving: boolean
  onMove: (entryId: number, sourceClientId: number, type: 'SALE' | 'PAYMENT') => void
  deleteInterest: (chargeId: number, sourceClientId: number) => void
  isDeletingInterest: boolean
}

interface LedgerWeekGroupsProps {
  groups: Array<{ label: string; items: CreditTransaction[] }>
  srcClientId: number
  actions: LedgerRowActions
}

// srcClientId is passed explicitly so the Move action knows which client owns the entry.
function detailText(tx: CreditTransaction): string {
  if (!tx.detail) return '—'
  if (tx.type === 'SALE') return FUEL_LABELS[tx.detail] ?? tx.detail
  if (tx.type === 'PAYMENT') return codeLabel(tx.detail)
  return tx.detail
}

function rowBadge(tx: CreditTransaction): { label: string; tone: string } {
  if (tx.status === 'PENDING_APPROVAL') return { label: 'Pending approval', tone: 'bg-amber-100 text-amber-800' }
  if (tx.status === 'REJECTED') return { label: 'Rejected', tone: 'bg-slate-100 text-slate-600' }
  if (tx.status === 'VOIDED') return { label: 'Voided', tone: 'bg-slate-100 text-slate-600' }
  if (tx.type === 'SALE') return { label: '↑ Sale', tone: 'bg-orange-100 text-orange-700' }
  if (tx.type === 'INTEREST') return { label: '% Interest', tone: 'bg-purple-100 text-purple-700' }
  return { label: '↓ Paid', tone: 'bg-green-100 text-green-700' }
}

export function LedgerWeekGroups({ groups, srcClientId, actions }: LedgerWeekGroupsProps) {
  const {
    canMoveEntries, canDeleteInterest, canApprovePayments, currentUserId, pendingPaymentRecorders,
    approvePayment, isApproving, onMove, deleteInterest, isDeletingInterest,
  } = actions

  return groups.map(({ label, items }) => {
    const weekSales    = items.filter(t => t.countedInBalance && t.type === 'SALE').reduce((s, t) => s + t.amount, 0)
    const weekPayments = items.filter(t => t.countedInBalance && t.type === 'PAYMENT').reduce((s, t) => s + t.amount, 0)
    const weekInterest = items.filter(t => t.countedInBalance && t.type === 'INTEREST').reduce((s, t) => s + t.amount, 0)
    return (
      <div key={label} className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <span className="ui-toolbar-title">{label}</span>
          <div className="ui-toolbar-actions text-xs">
            {weekSales    > 0 && <span className="text-orange-600">+₹{formatDecimal(weekSales)} sales</span>}
            {weekInterest > 0 && <span className="text-purple-600">+₹{formatDecimal(weekInterest)} interest</span>}
            {weekPayments > 0 && <span className="text-green-600">−₹{formatDecimal(weekPayments)} paid</span>}
          </div>
        </div>
        <ScrollRegion label={`Transactions, ${label}`} className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-50">
            {items.map((tx, idx) => (
              <tr key={`${tx.type}-${tx.referenceId}-${idx}`} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap w-20">
                  {formatDate(tx.businessDate)}
                </td>
                <td className="px-2 py-2.5 w-24">
                  <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${rowBadge(tx).tone}`}>
                    {rowBadge(tx).label}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-xs max-w-[160px]">
                  <span className="text-slate-500 truncate block">{tx.reference || detailText(tx)}</span>
                  {!tx.countedInBalance && (
                    <span className="text-[11px] font-medium text-slate-600">Not counted in balance</span>
                  )}
                </td>
                <td className={`px-2 py-2.5 text-right text-xs font-semibold ${
                  tx.type === 'PAYMENT' ? 'text-green-600' : tx.type === 'INTEREST' ? 'text-purple-600' : 'text-orange-600'
                }`}>
                  {tx.type === 'PAYMENT' ? '−' : '+'}₹{formatDecimal(tx.amount)}
                </td>
                <td className={`px-4 py-2.5 text-right text-xs font-bold w-28 ${
                  tx.runningBalance > 0 ? 'text-slate-700' : 'text-green-600'
                }`}>
                  ₹{formatDecimal(tx.runningBalance)}
                </td>
                <td className="px-3 py-2.5 w-28 text-right">
                  {canApprovePayments && tx.type === 'PAYMENT' && tx.status === 'PENDING_APPROVAL'
                    && pendingPaymentRecorders.has(tx.referenceId)
                    && pendingPaymentRecorders.get(tx.referenceId) !== currentUserId && (
                    <span className="inline-flex items-center gap-1 mr-2">
                      <button
                        type="button"
                        onClick={() => approvePayment(tx.referenceId, 'APPROVED')}
                        disabled={isApproving}
                        className="ui-btn ui-btn-primary min-h-0 px-2 py-0.5 text-xs disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => approvePayment(tx.referenceId, 'REJECTED')}
                        disabled={isApproving}
                        className="ui-btn ui-btn-danger min-h-0 px-2 py-0.5 text-xs disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </span>
                  )}
                  {canMoveEntries && (tx.type === 'SALE' || tx.type === 'PAYMENT') && (
                    <button
                      onClick={() => onMove(tx.referenceId, srcClientId, tx.type === 'PAYMENT' ? 'PAYMENT' : 'SALE')}
                      className="ui-btn ui-btn-secondary ui-btn-compact"
                      title={`Move this ${tx.type === 'PAYMENT' ? 'payment' : 'entry'} within the account group`}
                    >
                      Move
                    </button>
                  )}
                  {canDeleteInterest && tx.type === 'INTEREST' && (
                    <ConfirmButton
                      onConfirm={() => deleteInterest(tx.referenceId, srcClientId)}
                      disabled={isDeletingInterest}
                      triggerLabel="Remove"
                      triggerAriaLabel="Remove this interest charge"
                      prompt="Remove interest?"
                      triggerClassName="ui-btn ui-btn-ghost min-h-6 px-1 text-xs text-red-700 hover:text-red-800"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </ScrollRegion>
      </div>
    )
  })
}
