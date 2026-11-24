import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CreditClient } from '../../../api/creditApi'
import { Modal } from '../../../components/Modal'
import { MoneyText } from '../../../components/AmountText'
import { SkeletonRows } from '../../../components/Skeleton'

interface ChooseClientModalProps {
  clients: CreditClient[]
  isLoading: boolean
  onChoose: (clientId: number) => void
  onClose: () => void
}

/** The first step of Record payment when no client is open: pick a main account that owes money. */
export function ChooseClientModal({ clients, isLoading, onChoose, onClose }: ChooseClientModalProps) {
  const { t } = useTranslation(['credit', 'common'])
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const owingClients = clients
    .filter(client => client.parentClientId === null && client.outstandingBalance > 0)
    .filter(client => !query || client.name.toLowerCase().includes(query) || (client.phone ?? '').includes(query))
    .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: 'base' }))

  return (
    <Modal
      title={t('clientActions.recordPayment')}
      subtitle={t('choosePayer.subtitle')}
      tone="info"
      size="md"
      onClose={onClose}
      closeOnBackdropClick
      confirmDiscard={false}
      fullScreenOnPhone
      bodyClassName="space-y-3"
    >
      <label className="block">
        <span className="ui-label">{t('choosePayer.searchLabel')}</span>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('aging.searchPlaceholder')} className="text-sm" data-autofocus />
      </label>
      {isLoading ? (
        <SkeletonRows count={4} />
      ) : owingClients.length === 0 ? (
        <p className="ui-empty">{query ? t('aging.noMatch', { query: search.trim() }) : t('choosePayer.noneOwing')}</p>
      ) : (
        <ul aria-label={t('choosePayer.listLabel')} className="divide-y divide-border rounded-card border border-border">
          {owingClients.map(client => (
            <li key={client.id}>
              <button type="button" onClick={() => onChoose(client.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-sunken">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{client.name}</span>
                  <span className="block text-xs text-ink-3">{client.phone}</span>
                </span>
                <MoneyText value={client.outstandingBalance} className="shrink-0 text-sm font-semibold text-ink" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
