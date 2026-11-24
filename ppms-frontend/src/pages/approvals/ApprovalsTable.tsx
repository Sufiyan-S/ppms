import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { serverText } from '../../utils/serverText'
import type { ApprovalItem } from '../../api/approvalApi'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { MoneyText } from '../../components/AmountText'
import { codeLabel } from '../../constants/labels'
import { translateKey } from '../../i18n'
import { useIsPhone } from '../../hooks/useIsPhone'
import { formatIstDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'
import { approvalKey, waitingFor } from './approvalFormat'

interface ApprovalsTableProps {
  items: ApprovalItem[]
  selectedKeys: Set<string>
  now: number
  isDeciding: boolean
  onToggle: (item: ApprovalItem) => void
  onToggleAll: () => void
  onApprove: (item: ApprovalItem) => void
  onReject: (item: ApprovalItem) => void
}

function blockedReasonText(item: ApprovalItem): string | undefined {
  return item.blockedReason === null ? undefined : serverText(item.blockedReasonCode, item.blockedReasonParams, item.blockedReason)
}

function itemName(item: ApprovalItem) {
  return item.kind === 'EXPENSE' ? codeLabel(item.category ?? '') : (item.clientName ?? translateKey('approvals:table.clientNumber', { id: item.clientId }))
}

function kindText(t: TFunction<'approvals'>, item: ApprovalItem) {
  return item.kind === 'EXPENSE' ? t('kind.expense') : t('kind.creditPayment')
}

function selectLabel(t: TFunction<'approvals'>, item: ApprovalItem) {
  return t(item.kind === 'EXPENSE' ? 'table.selectExpense' : 'table.selectPayment', { name: itemName(item), amount: formatCurrency(item.amount) })
}

type CheckboxProps = Pick<ApprovalsTableProps, 'selectedKeys' | 'onToggle'> & { item: ApprovalItem }

function ItemCheckbox({ item, selectedKeys, onToggle, ...props }: CheckboxProps & { 'aria-label'?: string }) {
  return (
    <input
      type="checkbox"
      {...props}
      checked={selectedKeys.has(approvalKey(item))}
      disabled={item.blockedReason !== null}
      title={blockedReasonText(item)}
      onChange={() => onToggle(item)}
    />
  )
}

/** Phones show each item as a card with its own Approve and Reject buttons instead of nine narrow columns. */
function ApprovalCardRow({ item, now, isDeciding, onApprove, onReject, ...selection }: Omit<ApprovalsTableProps, 'items' | 'onToggleAll'> & { item: ApprovalItem }) {
  const { t } = useTranslation(['approvals', 'common'])
  const nameAndAmount = { name: itemName(item), amount: formatCurrency(item.amount) }
  const details = [kindText(t, item), item.submittedByName, waitingFor(item.submittedAt, now), formatIstDate(item.itemDate)].filter(Boolean)
  return (
    <tr data-testid="approval-card" className={selection.selectedKeys.has(approvalKey(item)) ? 'bg-info-bg' : undefined}>
      <td>
        <span className="flex items-start gap-2">
          <label className="-my-2.5 -ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center">
            <ItemCheckbox item={item} {...selection} />
            <span className="sr-only">{selectLabel(t, item)}</span>
          </label>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">{itemName(item)}</span>
            <span className="block text-xs text-ink-3">{details.join(' · ')}</span>
            {item.note && <span className="mt-1 block text-xs text-ink-2">{item.note}</span>}
            {item.blockedReason && <span className="mt-1 block text-xs text-warn">{blockedReasonText(item)}</span>}
          </span>
          <MoneyText value={item.amount} className="font-semibold text-ink" />
        </span>
      </td>
      <td>
        {item.blockedReason === null && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="ui-btn ui-btn-secondary" disabled={isDeciding}
              aria-label={t('table.rejectItem', nameAndAmount)} onClick={() => onReject(item)}>
              {t('common:actions.reject')}
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={isDeciding}
              aria-label={t('table.approveItem', nameAndAmount)} onClick={() => onApprove(item)}>
              {t('common:actions.approve')}
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

export function ApprovalsTable({ items, selectedKeys, now, isDeciding, onToggle, onToggleAll, onApprove, onReject }: ApprovalsTableProps) {
  const { t } = useTranslation(['approvals', 'common'])
  const isPhone = useIsPhone()
  const selectable = items.filter(item => item.blockedReason === null)
  const allSelected = selectable.length > 0 && selectable.every(item => selectedKeys.has(approvalKey(item)))
  const someSelected = selectable.some(item => selectedKeys.has(approvalKey(item)))

  const columns: DataTableColumn<ApprovalItem>[] = isPhone ? [
    { key: 'what', header: t('table.categoryOrClient') },
    { key: 'decide', header: t('table.decide') },
  ] : [
    {
      key: 'select',
      className: 'w-10',
      header: (
        <input
          type="checkbox"
          aria-label={t('table.selectAll')}
          checked={allSelected}
          ref={element => { if (element) element.indeterminate = someSelected && !allSelected }}
          disabled={selectable.length === 0}
          onChange={onToggleAll}
        />
      ),
      cell: item => <ItemCheckbox item={item} selectedKeys={selectedKeys} onToggle={onToggle} aria-label={selectLabel(t, item)} />,
    },
    { key: 'type', header: t('table.type'), className: 'whitespace-nowrap', cell: item => <span className="text-ink-2">{kindText(t, item)}</span> },
    {
      key: 'what',
      header: t('table.categoryOrClient'),
      cell: item => (
        <span className="font-medium text-ink">
          {itemName(item)}
          {item.blockedReason && <span className="block text-xs font-normal text-warn">{blockedReasonText(item)}</span>}
        </span>
      ),
    },
    { key: 'amount', header: t('table.amount'), numeric: true, cell: item => <MoneyText value={item.amount} className="font-semibold text-ink" /> },
    { key: 'submittedBy', header: t('table.submittedBy'), cell: item => <span className="text-ink-2">{item.submittedByName ?? '—'}</span> },
    { key: 'waiting', header: t('table.waiting'), className: 'whitespace-nowrap', cell: item => <span className="text-ink-2">{waitingFor(item.submittedAt, now)}</span> },
    { key: 'date', header: t('table.date'), className: 'whitespace-nowrap', cell: item => <span className="text-ink-3">{formatIstDate(item.itemDate)}</span> },
    { key: 'note', header: t('table.note'), className: 'max-w-xs', cell: item => <span className="text-ink-3">{item.note || '—'}</span> },
  ]

  return (
    <DataTable
      caption={t('table.caption')}
      captionHidden
      regionLabel={t('table.region')}
      columns={columns}
      rows={items}
      rowKey={approvalKey}
      rowClassName={item => selectedKeys.has(approvalKey(item)) ? 'bg-info-bg' : undefined}
      renderRow={isPhone ? item => (
        <ApprovalCardRow item={item} selectedKeys={selectedKeys} now={now} isDeciding={isDeciding}
          onToggle={onToggle} onApprove={onApprove} onReject={onReject} />
      ) : undefined}
      cardsOnPhone
      className="rounded-none border-0"
    />
  )
}
