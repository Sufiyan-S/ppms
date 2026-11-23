import { useMemo } from 'react'
import { serverText } from '../../utils/serverText'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { CreditTransaction } from '../../api/creditApi'
import { formatIstDate } from '../../utils/date'
import { formatDecimal } from '../../utils/format'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { creditTransactionBadge } from '../../components/statusBadges'
import { codeLabel } from '../../constants/labels'
import { FUEL_LABELS } from '../../constants/fuel'

const formatDate = (iso: string) =>
  formatIstDate(iso, { day: '2-digit', month: 'short' })

export interface LedgerRowActions {
  canMoveEntries: boolean
  canWaiveInterest: boolean
  canApprovePayments: boolean
  currentUserId: number | undefined
  pendingPaymentRecorders: Map<number, number>
  approvePayment: (paymentId: number) => void
  onRejectPayment: (payment: CreditTransaction) => void
  isApproving: boolean
  onMove: (entryId: number, sourceClientId: number, type: 'SALE' | 'PAYMENT') => void
  onWaiveInterest: (charge: CreditTransaction, sourceClientId: number) => void
}

interface LedgerWeekGroupsProps {
  groups: Array<{ label: string; items: CreditTransaction[] }>
  srcClientId: number
  actions: LedgerRowActions
}

// srcClientId is passed explicitly so the Move action knows which client owns the entry.
function detailText(tx: CreditTransaction): string {
  if (!tx.detail) return '—'
  if (tx.type === 'SALE') return tx.detail in FUEL_LABELS ? codeLabel(tx.detail) : tx.detail
  if (tx.type === 'PAYMENT') return codeLabel(tx.detail)
  return tx.detail
}

const isSale = (tx: CreditTransaction) => tx.type === 'SALE' || tx.type === 'COUNTER_SALE'

function ledgerColumns(t: TFunction<['credit', 'common']>): DataTableColumn<CreditTransaction>[] {
  return [
    { key: 'date', header: t('ledger.columns.date'), className: 'px-4 w-20' },
    { key: 'type', header: t('ledger.columns.type'), className: 'px-2 w-40' },
    { key: 'detail', header: t('ledger.columns.detail'), className: 'px-2' },
    { key: 'amount', header: t('ledger.columns.amount'), numeric: true, className: 'px-2 w-28' },
    { key: 'balance', header: t('ledger.columns.balance'), numeric: true, className: 'px-4 w-32' },
    { key: 'actions', header: <span className="sr-only">{t('ledger.columns.actions')}</span>, align: 'right', className: 'px-3 w-52' },
  ]
}

export function LedgerWeekGroups({ groups, srcClientId, actions }: LedgerWeekGroupsProps) {
  const { t } = useTranslation(['credit', 'common'])
  const columns = useMemo(() => ledgerColumns(t), [t])
  const {
    canMoveEntries, canWaiveInterest, canApprovePayments, currentUserId, pendingPaymentRecorders,
    approvePayment, onRejectPayment, isApproving, onMove, onWaiveInterest,
  } = actions

  return groups.map(({ label, items }, index) => {
    const weekSales    = items.filter(tx => tx.countedInBalance && isSale(tx)).reduce((s, tx) => s + tx.amount, 0)
    const weekPayments = items.filter(tx => tx.countedInBalance && tx.type === 'PAYMENT').reduce((s, tx) => s + tx.amount, 0)
    const weekInterest = items.filter(tx => tx.countedInBalance && tx.type === 'INTEREST').reduce((s, tx) => s + tx.amount, 0)
    return (
      <div key={label} className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <span className="ui-toolbar-title">{label}</span>
          <div className="ui-toolbar-actions text-xs">
            {weekSales    > 0 && <span className="text-warn">{t('ledger.week.sales', { amount: `+₹${formatDecimal(weekSales)}` })}</span>}
            {weekInterest > 0 && <span className="text-info">{t('ledger.week.interest', { amount: `+₹${formatDecimal(weekInterest)}` })}</span>}
            {weekPayments > 0 && <span className="text-ok">{t('ledger.week.paid', { amount: `−₹${formatDecimal(weekPayments)}` })}</span>}
          </div>
        </div>
        <DataTable
          caption={t('ledger.weekCaption', { week: label })}
          captionHidden
          headerHidden={index > 0}
          columns={columns}
          rows={items}
          rowKey={tx => `${tx.type}-${tx.referenceId}-${items.indexOf(tx)}`}
          className="rounded-none border-0"
          tableClassName="table-fixed min-w-208"
          renderRow={tx => (
            <tr>
              <td className="px-4 py-2.5 text-ink-3 text-xs whitespace-nowrap w-20">
                {formatDate(tx.businessDate)}
              </td>
              <td className="px-2 py-2.5 w-40">
                <StatusBadge {...creditTransactionBadge(tx)} />
              </td>
              <td className="px-2 py-2.5 text-xs">
                <span className="text-ink-3 truncate block">{(tx.reference && serverText(tx.referenceCode, tx.referenceParams, tx.reference)) || detailText(tx)}</span>
                {!tx.countedInBalance && (
                  <span className="text-xs font-medium text-ink-2">{t('ledger.notCounted')}</span>
                )}
              </td>
              <td className={`px-2 py-2.5 w-28 text-right text-xs font-semibold ${
                tx.type === 'PAYMENT' ? 'text-ok' : tx.type === 'INTEREST' ? 'text-info' : 'text-warn'
              }`}>
                <MoneyText value={tx.type === 'PAYMENT' ? -tx.amount : tx.amount} showSign />
              </td>
              <td className={`px-4 py-2.5 text-right text-xs font-bold w-32 ${
                tx.runningBalance > 0 ? 'text-ink' : 'text-ok'
              }`}>
                <MoneyText value={tx.runningBalance} />
              </td>
              <td className="px-3 py-2.5 w-52 text-right">
                {canApprovePayments && tx.type === 'PAYMENT' && tx.status === 'PENDING_APPROVAL'
                  && pendingPaymentRecorders.has(tx.referenceId)
                  && pendingPaymentRecorders.get(tx.referenceId) !== currentUserId && (
                  <span className="inline-flex items-center gap-1 mr-2">
                    <button
                      type="button"
                      onClick={() => approvePayment(tx.referenceId)}
                      disabled={isApproving}
                      className="ui-btn ui-btn-primary min-h-0 px-2 py-0.5 text-xs disabled:opacity-50"
                    >
                      {t('common:actions.approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectPayment(tx)}
                      disabled={isApproving}
                      className="ui-btn ui-btn-danger min-h-0 px-2 py-0.5 text-xs disabled:opacity-50"
                    >
                      {t('common:actions.reject')}
                    </button>
                  </span>
                )}
                {canMoveEntries && (tx.type === 'SALE' || tx.type === 'PAYMENT') && (
                  <button
                    onClick={() => onMove(tx.referenceId, srcClientId, tx.type === 'PAYMENT' ? 'PAYMENT' : 'SALE')}
                    className="ui-btn ui-btn-secondary ui-btn-compact"
                    title={tx.type === 'PAYMENT' ? t('ledger.movePaymentTitle') : t('ledger.moveEntryTitle')}
                  >
                    {t('ledger.move')}
                  </button>
                )}
                {canWaiveInterest && tx.type === 'INTEREST' && tx.status !== 'WAIVED' && (
                  <button
                    type="button"
                    onClick={() => onWaiveInterest(tx, srcClientId)}
                    aria-label={t('ledger.waiveLabel')}
                    className="ui-btn ui-btn-ghost min-h-6 px-1 text-xs text-bad hover:text-bad-strong"
                  >
                    {t('ledger.waive')}
                  </button>
                )}
              </td>
            </tr>
          )}
        />
      </div>
    )
  })
}
