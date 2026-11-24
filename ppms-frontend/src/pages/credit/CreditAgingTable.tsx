import { useMemo } from 'react'
import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { CreditAgingRow } from '../../api/creditApi'
import { formatCurrency } from '../../utils/format'
import { formatIstDate } from '../../utils/date'
import { DataTable } from '../../components/DataTable'
import type { DataTableColumn } from '../../components/DataTable'
import { MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { creditStandingBadge } from '../../components/statusBadges'
import { useIsPhone } from '../../hooks/useIsPhone'
import type { AgingSortKey, SortDirection } from './creditAging'
import { CreditAgingCardRow } from './CreditAgingCardRow'

const SORTABLE_COLUMNS: { key: AgingSortKey; numeric: boolean }[] = [
  { key: 'name', numeric: false },
  { key: 'outstanding', numeric: true },
  { key: 'upTo30Days', numeric: true },
  { key: 'days31To60', numeric: true },
  { key: 'days61To90', numeric: true },
  { key: 'over90Days', numeric: true },
  { key: 'oldestUnpaidSaleDate', numeric: false },
  { key: 'lastPaymentDate', numeric: false },
  { key: 'daysOverdue', numeric: true },
]

function agingColumns(t: TFunction<'credit'>): DataTableColumn<CreditAgingRow>[] {
  return [
    ...SORTABLE_COLUMNS.map(column => ({
      key: column.key, header: t(`aging.columns.${column.key}`), numeric: column.numeric, sortable: true,
    })),
    { key: 'status', header: t('aging.columns.status') },
    { key: 'actions', header: <span className="sr-only">{t('aging.columns.actions')}</span>, align: 'right' },
  ]
}

function phoneColumns(t: TFunction<'credit'>): DataTableColumn<CreditAgingRow>[] {
  return [
    { key: 'name', header: t('aging.columns.name') },
    { key: 'ageBuckets', header: t('aging.ageBuckets.label') },
    { key: 'status', header: t('aging.columns.status') },
    { key: 'actions', header: t('aging.columns.actions') },
  ]
}

function amountCell(amount: number) {
  return amount > 0 ? <MoneyText value={amount} /> : <span className="text-ink-3">—</span>
}
interface CreditAgingTableProps {
  rows: CreditAgingRow[]
  sortKey: AgingSortKey
  sortDirection: SortDirection
  canAdjustLimit: boolean
  onSort: (key: AgingSortKey) => void
  onOpenClient: (clientId: number) => void
  onSetLimit: (clientId: number) => void
}

export function CreditAgingTable({
  rows, sortKey, sortDirection, canAdjustLimit, onSort, onOpenClient, onSetLimit,
}: CreditAgingTableProps) {
  const { t } = useTranslation('credit')
  const isPhone = useIsPhone()
  const columns = useMemo(() => isPhone ? phoneColumns(t) : agingColumns(t), [isPhone, t])
  return (
    <DataTable
      caption={t('aging.caption')}
      captionHidden
      regionLabel={t('aging.region')}
      columns={columns}
      rows={rows}
      rowKey={row => row.clientId}
      sort={{ key: sortKey, direction: sortDirection }}
      onSortChange={key => onSort(key as AgingSortKey)}
      cardsOnPhone
      className="rounded-none border-0"
      renderRow={row => isPhone ? (
        <CreditAgingCardRow row={row} canAdjustLimit={canAdjustLimit} onOpenClient={onOpenClient} onSetLimit={onSetLimit} />
      ) : (
        <tr>
          <th scope="row" className="text-left font-medium">
            <button type="button" onClick={() => onOpenClient(row.clientId)} className="ui-link text-left">
              {row.name}
            </button>
            <span className="block text-xs font-normal text-ink-3">
              {row.phone ?? t('aging.noPhone')}
              {row.subAccountCount > 0 && ` · ${t('aging.subAccounts', { count: row.subAccountCount })}`}
              {row.creditLimit > 0 && ` · ${t('aging.limit', { amount: formatCurrency(row.creditLimit) })}`}
            </span>
          </th>
          <td className="text-right font-semibold text-ink"><MoneyText value={row.outstanding} /></td>
          <td className="text-right">{amountCell(row.upTo30Days)}</td>
          <td className="text-right">{amountCell(row.days31To60)}</td>
          <td className="text-right">{amountCell(row.days61To90)}</td>
          <td className="text-right">{amountCell(row.over90Days)}</td>
          <td className="whitespace-nowrap text-ink-2">{row.oldestUnpaidSaleDate ? formatIstDate(row.oldestUnpaidSaleDate) : '—'}</td>
          <td className="whitespace-nowrap text-ink-2">{row.lastPaymentDate ? formatIstDate(row.lastPaymentDate) : t('aging.never')}</td>
          <td className={`whitespace-nowrap text-right tabular-nums ${row.daysOverdue > 0 ? 'font-semibold text-bad' : 'text-ink-3'}`}>
            {row.daysOverdue > 0 ? row.daysOverdue : '—'}
          </td>
          <td className="whitespace-nowrap">
            <StatusBadge {...creditStandingBadge(row.creditStatus)} />
            {row.pendingPaymentCount > 0 && (
              <StatusBadge tone="info" icon={Hourglass} label={t('aging.pendingCount', { count: row.pendingPaymentCount })} className="ml-1" />
            )}
          </td>
          <td className="whitespace-nowrap text-right">
            {canAdjustLimit && (
              <button type="button" onClick={() => onSetLimit(row.clientId)}
                aria-label={t('aging.setLimitFor', { name: row.name })} className="ui-btn ui-btn-ghost ui-btn-compact">
                {t('aging.limitButton')}
              </button>
            )}
            <button type="button" onClick={() => onOpenClient(row.clientId)}
              aria-label={t('aging.viewLedgerOf', { name: row.name })} className="ui-btn ui-btn-secondary ui-btn-compact">
              {t('aging.viewLedger')}
            </button>
          </td>
        </tr>
      )}
    />
  )
}
