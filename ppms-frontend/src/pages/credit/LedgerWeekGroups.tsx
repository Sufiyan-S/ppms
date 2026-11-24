import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { CreditTransaction } from '../../api/creditApi'
import { formatIstDate } from '../../utils/date'
import { formatCurrency, formatWithSign } from '../../utils/format'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { creditTransactionBadge } from '../../components/statusBadges'
import { useIsPhone } from '../../hooks/useIsPhone'
import { LedgerEntryActions } from './LedgerEntryActions'
import type { LedgerRowActions } from './LedgerEntryActions'
import { entryAmountClass, entryDescription, signedEntryAmount } from './ledgerGroups'

const formatDate = (iso: string) =>
  formatIstDate(iso, { day: '2-digit', month: 'short' })

interface LedgerWeekGroupsProps {
  groups: Array<{ label: string; items: CreditTransaction[] }>
  srcClientId: number
  actions: LedgerRowActions
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

/** A phone shows each entry as a stacked row: date, type and description on the left, signed amount and balance on the right. */
function LedgerEntryCard({ tx, srcClientId, actions }: { tx: CreditTransaction; srcClientId: number; actions: LedgerRowActions }) {
  const { t } = useTranslation(['credit', 'common'])
  return (
    <li data-testid="ledger-entry" className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-ink-3">{formatDate(tx.businessDate)}</p>
          <StatusBadge {...creditTransactionBadge(tx)} />
          <p className="break-words text-xs text-ink-3">{entryDescription(tx)}</p>
          {!tx.countedInBalance && <p className="text-xs font-medium text-ink-2">{t('ledger.notCounted')}</p>}
        </div>
        <div className="shrink-0 text-right">
          <MoneyText value={signedEntryAmount(tx)} showSign className={`block text-sm font-semibold ${entryAmountClass(tx)}`} />
          <p className="text-xs text-ink-3">
            {t('ledger.columns.balance')}{' '}
            <MoneyText value={tx.runningBalance} className={`font-semibold ${tx.runningBalance > 0 ? 'text-ink' : 'text-ok'}`} />
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        <LedgerEntryActions tx={tx} srcClientId={srcClientId} actions={actions} />
      </div>
    </li>
  )
}

export function LedgerWeekGroups({ groups, srcClientId, actions }: LedgerWeekGroupsProps) {
  const { t } = useTranslation(['credit', 'common'])
  const isPhone = useIsPhone()
  const columns = useMemo(() => ledgerColumns(t), [t])

  return groups.map(({ label, items }, index) => {
    const weekSales    = items.filter(tx => tx.countedInBalance && isSale(tx)).reduce((s, tx) => s + tx.amount, 0)
    const weekPayments = items.filter(tx => tx.countedInBalance && tx.type === 'PAYMENT').reduce((s, tx) => s + tx.amount, 0)
    const weekInterest = items.filter(tx => tx.countedInBalance && tx.type === 'INTEREST').reduce((s, tx) => s + tx.amount, 0)
    const entryKey = (tx: CreditTransaction) => `${tx.type}-${tx.referenceId}-${items.indexOf(tx)}`
    return (
      <div key={label} className="ui-card p-0 overflow-hidden">
        <div className="ui-toolbar">
          <span className="ui-toolbar-title">{label}</span>
          <div className="ui-toolbar-actions text-xs">
            {weekSales    > 0 && <span className="text-warn">{t('ledger.week.sales', { amount: formatWithSign(weekSales, formatCurrency) })}</span>}
            {weekInterest > 0 && <span className="text-info">{t('ledger.week.interest', { amount: formatWithSign(weekInterest, formatCurrency) })}</span>}
            {weekPayments > 0 && <span className="text-ok">{t('ledger.week.paid', { amount: formatWithSign(-weekPayments, formatCurrency) })}</span>}
          </div>
        </div>
        {isPhone ? (
          <ul aria-label={t('ledger.weekCaption', { week: label })} className="divide-y divide-border border-t border-border">
            {items.map(tx => <LedgerEntryCard key={entryKey(tx)} tx={tx} srcClientId={srcClientId} actions={actions} />)}
          </ul>
        ) : (
          <DataTable
            caption={t('ledger.weekCaption', { week: label })}
            captionHidden
            headerHidden={index > 0}
            columns={columns}
            rows={items}
            rowKey={entryKey}
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
                  <span className="text-ink-3 truncate block">{entryDescription(tx)}</span>
                  {!tx.countedInBalance && (
                    <span className="text-xs font-medium text-ink-2">{t('ledger.notCounted')}</span>
                  )}
                </td>
                <td className={`px-2 py-2.5 w-28 text-right text-xs font-semibold ${entryAmountClass(tx)}`}>
                  <MoneyText value={signedEntryAmount(tx)} showSign />
                </td>
                <td className={`px-4 py-2.5 text-right text-xs font-bold w-32 ${
                  tx.runningBalance > 0 ? 'text-ink' : 'text-ok'
                }`}>
                  <MoneyText value={tx.runningBalance} />
                </td>
                <td className="px-3 py-2.5 w-52 text-right">
                  <LedgerEntryActions tx={tx} srcClientId={srcClientId} actions={actions} />
                </td>
              </tr>
            )}
          />
        )}
      </div>
    )
  })
}
