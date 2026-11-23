import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CreditClient } from '../../api/creditApi'
import { SkeletonRows } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { SetCreditLimitModal } from './modals/SetCreditLimitModal'
import { CreditAgingTable } from './CreditAgingTable'
import { AgingFilterBar } from './AgingFilterBar'
import type { CreditAgingView } from './useCreditAging'

interface AgingTableTabProps {
  pumpId: number
  view: CreditAgingView
  clients: CreditClient[]
  canAdjustLimit: boolean
  onOpenClient: (clientId: number) => void
}

/** Every account with its unpaid balance split by age, sortable by any column. */
export function AgingTableTab({ pumpId, view, clients, canAdjustLimit, onOpenClient }: AgingTableTabProps) {
  const { t } = useTranslation('credit')
  const [limitClientId, setLimitClientId] = useState<number | null>(null)
  const { aging, isLoading, isError, allRows, rows, sort, toggleSort, hasQuery, searchedFor } = view
  const limitClient = clients.find(client => client.id === limitClientId)

  return (
    <>
      {limitClient && (
        <SetCreditLimitModal client={limitClient} pumpId={pumpId} onClose={() => setLimitClientId(null)} />
      )}

      <AgingFilterBar view={view} />

      {isLoading ? (
        <div className="px-5 py-4"><SkeletonRows count={5} /></div>
      ) : isError ? (
        <div role="alert" className="ui-alert ui-alert-danger m-4 text-sm">{t('aging.loadFailed')}</div>
      ) : aging && allRows.length === 0 ? (
        <EmptyState icon="transactions" title={t('aging.noClients')} subtitle={t('aging.noClientsHint')} />
      ) : rows.length === 0 ? (
        <EmptyState icon="generic"
          title={hasQuery ? t('aging.noMatch', { query: searchedFor }) : t('aging.noneInView')}
          subtitle={hasQuery ? t('aging.noMatchHint') : t('aging.noneInViewHint')} />
      ) : (
        <CreditAgingTable
          rows={rows}
          sortKey={sort.key}
          sortDirection={sort.direction}
          canAdjustLimit={canAdjustLimit}
          onSort={toggleSort}
          onOpenClient={onOpenClient}
          onSetLimit={setLimitClientId}
        />
      )}
    </>
  )
}
