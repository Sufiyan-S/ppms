import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CreditAgingRow } from '../../api/creditApi'
import { MoneyText } from '../../components/AmountText'
import { StatusBadge } from '../../components/StatusBadge'
import { creditStandingBadge } from '../../components/statusBadges'
import { formatCurrency } from '../../utils/format'

const AGE_BUCKETS = ['upTo30Days', 'days31To60', 'days61To90', 'over90Days'] as const

interface CreditAgingCardRowProps {
  row: CreditAgingRow
  canAdjustLimit: boolean
  onOpenClient: (clientId: number) => void
  onSetLimit: (clientId: number) => void
}

/** One client on a phone: name, total outstanding, only the age buckets that hold money, status and actions. */
export function CreditAgingCardRow({ row, canAdjustLimit, onOpenClient, onSetLimit }: CreditAgingCardRowProps) {
  const { t } = useTranslation('credit')
  const buckets = AGE_BUCKETS.filter(bucket => row[bucket] > 0)
  return (
    <tr data-testid="aging-card">
      <th scope="row" className="font-medium">
        <span className="flex items-start justify-between gap-3">
          <button type="button" onClick={() => onOpenClient(row.clientId)} className="ui-link min-w-0 text-left">
            {row.name}
          </button>
          <MoneyText value={row.outstanding} className="text-sm font-semibold text-ink" />
        </span>
        <span className="block text-xs font-normal text-ink-3">
          {row.phone ?? t('aging.noPhone')}
          {row.subAccountCount > 0 && ` · ${t('aging.subAccounts', { count: row.subAccountCount })}`}
          {row.creditLimit > 0 && ` · ${t('aging.limit', { amount: formatCurrency(row.creditLimit) })}`}
        </span>
      </th>
      <td>
        {buckets.length > 0 && (
          <dl aria-label={t('aging.ageBuckets.label')} className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {buckets.map(bucket => (
              <div key={bucket} className="flex items-baseline gap-1.5">
                <dt className="text-ink-3">{t(`aging.ageBuckets.${bucket}`)}</dt>
                <dd className={`m-0 font-medium ${bucket === 'over90Days' ? 'text-bad' : 'text-ink-2'}`}><MoneyText value={row[bucket]} /></dd>
              </div>
            ))}
          </dl>
        )}
      </td>
      <td>
        <span className="flex flex-wrap items-center gap-1">
          <StatusBadge {...creditStandingBadge(row.creditStatus)} />
          {row.pendingPaymentCount > 0 && (
            <StatusBadge tone="info" icon={Hourglass} label={t('aging.pendingCount', { count: row.pendingPaymentCount })} />
          )}
          {row.daysOverdue > 0 && (
            <span className="text-xs font-semibold text-bad">{t('aging.overdueDays', { count: row.daysOverdue })}</span>
          )}
        </span>
      </td>
      <td>
        <div className="flex flex-wrap gap-2">
          {canAdjustLimit && (
            <button type="button" onClick={() => onSetLimit(row.clientId)}
              aria-label={t('aging.setLimitFor', { name: row.name })} className="ui-btn ui-btn-ghost">
              {t('aging.limitButton')}
            </button>
          )}
          <button type="button" onClick={() => onOpenClient(row.clientId)}
            aria-label={t('aging.viewLedgerOf', { name: row.name })} className="ui-btn ui-btn-secondary flex-1">
            {t('aging.viewLedger')}
          </button>
        </div>
      </td>
    </tr>
  )
}
