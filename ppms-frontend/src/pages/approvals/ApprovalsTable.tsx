import { useTranslation } from 'react-i18next'
import { serverText } from '../../utils/serverText'
import type { ApprovalItem } from '../../api/approvalApi'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { MoneyText } from '../../components/AmountText'
import { codeLabel } from '../../constants/labels'
import { translateKey } from '../../i18n'
import { formatIstDate } from '../../utils/date'
import { formatCurrency } from '../../utils/format'
import { approvalKey, waitingFor } from './approvalFormat'

interface ApprovalsTableProps {
  items: ApprovalItem[]
  selectedKeys: Set<string>
  now: number
  onToggle: (item: ApprovalItem) => void
  onToggleAll: () => void
}

function blockedReasonText(item: ApprovalItem): string | undefined {
  return item.blockedReason === null ? undefined : serverText(item.blockedReasonCode, item.blockedReasonParams, item.blockedReason)
}

function itemName(item: ApprovalItem) {
  return item.kind === 'EXPENSE' ? codeLabel(item.category ?? '') : (item.clientName ?? translateKey('approvals:table.clientNumber', { id: item.clientId }))
}

export function ApprovalsTable({ items, selectedKeys, now, onToggle, onToggleAll }: ApprovalsTableProps) {
  const { t } = useTranslation('approvals')
  const selectable = items.filter(item => item.blockedReason === null)
  const allSelected = selectable.length > 0 && selectable.every(item => selectedKeys.has(approvalKey(item)))
  const someSelected = selectable.some(item => selectedKeys.has(approvalKey(item)))

  const columns: DataTableColumn<ApprovalItem>[] = [
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
      cell: item => (
        <input
          type="checkbox"
          aria-label={t(item.kind === 'EXPENSE' ? 'table.selectExpense' : 'table.selectPayment', { name: itemName(item), amount: formatCurrency(item.amount) })}
          checked={selectedKeys.has(approvalKey(item))}
          disabled={item.blockedReason !== null}
          title={blockedReasonText(item)}
          onChange={() => onToggle(item)}
        />
      ),
    },
    { key: 'type', header: t('table.type'), className: 'whitespace-nowrap', cell: item => <span className="text-ink-2">{item.kind === 'EXPENSE' ? t('kind.expense') : t('kind.creditPayment')}</span> },
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
      className="rounded-none border-0"
    />
  )
}
