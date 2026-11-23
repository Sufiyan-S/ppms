import { Link } from 'react-router-dom'
import type { To } from 'react-router-dom'
import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CreditAgingRow } from '../../api/creditApi'
import { MoneyText } from '../../components/AmountText'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonRows } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { creditStandingBadge } from '../../components/statusBadges'
import { AgingFilterBar } from './AgingFilterBar'
import type { CreditAgingView } from './useCreditAging'

function AccountListItem({ row, to, selected }: { row: CreditAgingRow; to: To; selected: boolean }) {
  const { t } = useTranslation('credit')
  return (
    <Link to={to} aria-current={selected ? 'page' : undefined} className="ui-list-item">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{row.name}</span>
        <span className="block text-xs text-ink-3">
          {row.phone ?? t('aging.noPhone')}
          {row.subAccountCount > 0 && ` · ${t('aging.subAccounts', { count: row.subAccountCount })}`}
          {row.daysOverdue > 0 && ` · ${t('list.daysOverdue', { count: row.daysOverdue })}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <MoneyText value={row.outstanding} className="text-sm font-semibold text-ink" />
        <span className="flex flex-wrap justify-end gap-1">
          <StatusBadge {...creditStandingBadge(row.creditStatus)} />
          {row.pendingPaymentCount > 0 && (
            <StatusBadge tone="info" icon={Hourglass} label={t('aging.pendingCount', { count: row.pendingPaymentCount })} />
          )}
        </span>
      </span>
    </Link>
  )
}

interface CreditAccountListProps {
  view: CreditAgingView
  selectedClientId: number | null
  linkToClient: (clientId: number) => To
}

/** Credit accounts beside the open client: the aging filters, search and sort, then one link per account. */
export function CreditAccountList({ view, selectedClientId, linkToClient }: CreditAccountListProps) {
  const { t } = useTranslation('credit')
  const { aging, isLoading, isError, allRows, rows, hasQuery, searchedFor } = view

  return (
    <>
      <AgingFilterBar view={view} showSortMenu />
      {isLoading ? (
        <div className="px-4 py-3"><SkeletonRows count={5} /></div>
      ) : isError ? (
        <p role="alert" className="ui-alert ui-alert-danger m-4 text-sm">{t('aging.loadFailed')}</p>
      ) : aging && allRows.length === 0 ? (
        <EmptyState icon="transactions" title={t('aging.noClients')} subtitle={t('aging.noClientsHint')} />
      ) : rows.length === 0 ? (
        <EmptyState icon="generic"
          title={hasQuery ? t('aging.noMatch', { query: searchedFor }) : t('aging.noneInView')}
          subtitle={hasQuery ? t('aging.noMatchHint') : t('aging.noneInViewHint')} />
      ) : (
        <ul>
          {rows.map(row => (
            <li key={row.clientId}>
              <AccountListItem row={row} to={linkToClient(row.clientId)} selected={row.clientId === selectedClientId} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
