import { useTranslation } from 'react-i18next'
import type { CreditTransaction } from '../../api/creditApi'

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

/** Approve or reject a pending payment, move an entry, or waive an interest charge — whichever the entry and role allow. */
export function LedgerEntryActions({ tx, srcClientId, actions }: { tx: CreditTransaction; srcClientId: number; actions: LedgerRowActions }) {
  const { t } = useTranslation(['credit', 'common'])
  const {
    canMoveEntries, canWaiveInterest, canApprovePayments, currentUserId, pendingPaymentRecorders,
    approvePayment, onRejectPayment, isApproving, onMove, onWaiveInterest,
  } = actions

  return (
    <>
      {canApprovePayments && tx.type === 'PAYMENT' && tx.status === 'PENDING_APPROVAL'
        && pendingPaymentRecorders.has(tx.referenceId)
        && pendingPaymentRecorders.get(tx.referenceId) !== currentUserId && (
        <span className="inline-flex items-center gap-1 mr-2">
          <button
            type="button"
            onClick={() => approvePayment(tx.referenceId)}
            disabled={isApproving}
            className="ui-btn ui-btn-primary ui-btn-compact"
          >
            {t('common:actions.approve')}
          </button>
          <button
            type="button"
            onClick={() => onRejectPayment(tx)}
            disabled={isApproving}
            className="ui-btn ui-btn-danger ui-btn-compact"
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
    </>
  )
}
