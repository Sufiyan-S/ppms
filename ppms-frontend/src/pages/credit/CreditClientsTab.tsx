import { useState, useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { pumpApi } from '../../api/pumpApi'
import type { CreditClient as PumpCreditClient } from '../../api/pumpApi'
import { SkeletonRows } from '../../components/Skeleton'
import { LoadError } from '../../components/LoadError'
import { EmptyState } from '../../components/EmptyState'
import { AddCreditClientForm } from './AddCreditClientForm'
import { CreditClientGroup } from './CreditClientGroup'

interface CreditClientsTabProps {
  pumpId: number
  canManageClients: boolean
  canManagePortalPins: boolean
}

export function CreditClientsTab({ pumpId, canManageClients, canManagePortalPins }: CreditClientsTabProps) {
  const { t } = useTranslation(['credit', 'common'])
  const [clientSearch, setClientSearch] = useState('')
  const deferredSearch = useDeferredValue(clientSearch)
  const [expandedParentId, setExpandedParentId] = useState<number | null>(null)
  const [openMenuClientId, setOpenMenuClientId] = useState<number | null>(null)

  const { data: clients = [], isLoading, isLoadingError, refetch } = useQuery({
    queryKey: ['creditClients', pumpId],
    queryFn:  () => pumpApi.getCreditClientAccounts(pumpId),
  })

  // Active clients first, disabled clients at bottom — each group sorted by name
  const rootClients = clients
    .filter(c => c.parentClientId === null)
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  const childrenByParent = clients.reduce<Record<number, PumpCreditClient[]>>((acc, c) => {
    if (c.parentClientId !== null) {
      acc[c.parentClientId] = [...(acc[c.parentClientId] ?? []), c]
    }
    return acc
  }, {})

  const q = deferredSearch.toLowerCase().trim()
  const matchesQuery = (c: PumpCreditClient) =>
    c.name.toLowerCase().includes(q) ||
    (c.phone ?? '').includes(q) ||
    (c.notes ?? '').toLowerCase().includes(q)

  const filteredRootClients = q
    ? rootClients.filter(parent =>
        matchesQuery(parent) || (childrenByParent[parent.id] ?? []).some(matchesQuery)
      )
    : rootClients

  if (isLoading) return <div className="px-5 py-4"><SkeletonRows count={4} /></div>
  if (isLoadingError) return <LoadError onRetry={() => void refetch()} className="m-4" />

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-3">
        {t('clients.intro')}
        {canManageClients ? ` ${t('clients.introManage')}` : ''}
      </p>

      {rootClients.length > 0 && (
        <div className="ui-search-shell">
          <svg className="ui-search-shell__icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input aria-label={t('clients.searchLabel')}
            type="text"
            className="ui-search-shell__input"
            placeholder={t('clients.searchPlaceholder')}
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
          />
          {clientSearch && (
            <button
              type="button"
              onClick={() => setClientSearch('')}
              className="ui-search-shell__clear"
              aria-label={t('aging.clearSearch')}
            >
              ×
            </button>
          )}
        </div>
      )}

      {filteredRootClients.length > 0 ? (
        <div className="space-y-3">
          {filteredRootClients.map(parent => {
            const subAccounts = childrenByParent[parent.id] ?? []
            return (
              <CreditClientGroup
                key={parent.id}
                pumpId={pumpId}
                parent={parent}
                subAccounts={subAccounts}
                isExpanded={q ? subAccounts.some(matchesQuery) : expandedParentId === parent.id}
                onToggle={() => setExpandedParentId(prev => prev === parent.id ? null : parent.id)}
                onExpand={() => setExpandedParentId(parent.id)}
                canManageClients={canManageClients}
                canManagePortalPins={canManagePortalPins}
                openMenuClientId={openMenuClientId}
                onMenuChange={setOpenMenuClientId}
              />
            )
          })}
        </div>
      ) : q ? (
        <p className="text-sm text-ink-3 py-2">{t('clients.noMatch', { query: deferredSearch })}</p>
      ) : null}

      {canManageClients && <AddCreditClientForm pumpId={pumpId} clients={clients} />}

      {!canManageClients && rootClients.length === 0 && (
        <EmptyState icon="generic" title={t('aging.noClients')}
          subtitle={t('clients.emptyReadOnlyHint')} />
      )}
    </div>
  )
}
