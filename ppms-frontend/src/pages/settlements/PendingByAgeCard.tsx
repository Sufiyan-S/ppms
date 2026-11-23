import { AlertTriangle, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PendingSettlementRange } from '../../api/paymentSettlementApi'
import { SkeletonRows } from '../../components/Skeleton'
import { parseApiError } from '../../utils/apiError'
import { StatusBadge } from '../../components/StatusBadge'
import { MoneyText } from '../../components/AmountText'
import { typeLabel } from './settlementFormat'
import { ageLabel, collectionDaysLabel } from './settlementAging'
import { PageSection } from '../../components/layout/PageSection'

/** Money collected by UPI / Card / Fleet Card that has not reached the bank, oldest first, flagged once past T+2. */
export function PendingByAgeCard({ ranges, isLoading, error }: {
  ranges: PendingSettlementRange[] | undefined
  isLoading: boolean
  error: unknown
}) {
  const { t } = useTranslation('settlements')
  const overdueCount = ranges?.filter((range) => range.overdue).length ?? 0
  return (
    <PageSection
      title={t('pendingByAge.title')}
      titleMeta={overdueCount > 0 && (
        <StatusBadge tone="warn" icon={AlertTriangle} label={t('pendingByAge.overdueCount', { count: overdueCount })} />
      )}
      description={t('pendingByAge.note')}
      flush
    >
      {isLoading ? (
        <div className="px-5 py-4"><SkeletonRows count={2} /></div>
      ) : error ? (
        <p role="alert" className="ui-alert ui-alert-danger m-4 text-sm">{parseApiError(error, t('pendingByAge.loadFailed'))}</p>
      ) : !ranges || ranges.length === 0 ? (
        <p className="ui-empty px-5 py-4">{t('pendingByAge.empty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {ranges.map((range) => (
            <li key={`${range.paymentType}-${range.fromDate}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className="font-semibold text-ink">
                {typeLabel(range.paymentType)} {collectionDaysLabel(range.fromDate, range.toDate)}
              </span>
              <MoneyText value={range.amount} className="text-ink-2" />
              <StatusBadge
                tone={range.overdue ? 'warn' : 'neutral'}
                icon={range.overdue ? AlertTriangle : Clock}
                label={range.overdue ? t('pendingByAge.ageOverdue', { age: ageLabel(range.ageDays) }) : ageLabel(range.ageDays)}
                className="ml-auto"
              />
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  )
}
