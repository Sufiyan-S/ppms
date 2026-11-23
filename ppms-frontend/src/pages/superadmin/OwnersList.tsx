import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check } from 'lucide-react'
import type { OwnerSummary } from '../../api/superAdminApi'
import { ListDetail } from '../../components/layout/ListDetail'
import { PageSection } from '../../components/layout/PageSection'
import { SkeletonRows } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { OwnerDetail } from './OwnerDetail'
import { ownerStatusLabel } from './ownerStatus'

const ownersPageSize = 10

function OwnerListItem({ owner, selected }: { owner: OwnerSummary; selected: boolean }) {
  const { t } = useTranslation(['superadmin', 'common'])
  const [searchParams] = useSearchParams()
  const search = new URLSearchParams(searchParams)
  search.set('owner', String(owner.ownerId))
  const disabledPumps = owner.pumps.filter((pump) => !pump.enabled).length
  const setUpPumps = owner.pumps.filter((pump) => pump.setupDoneCount === pump.setupRequiredCount).length
  const allSetUp = setUpPumps === owner.pumps.length

  return (
    <Link to={{ search: `?${search.toString()}` }} aria-current={selected ? 'page' : undefined} className="ui-list-item">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{owner.fullName}</span>
        <span className="block font-mono text-xs text-ink-3">{owner.phoneNumber}</span>
        <span className="mt-1 block text-xs text-ink-2">
          {t('owners.pumpCount', { count: owner.pumps.length })}
          {disabledPumps > 0 && <span className="text-bad"> {t('owners.disabledCount', { value: disabledPumps })}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge tone={owner.status === 'ACTIVE' ? 'ok' : 'neutral'} label={ownerStatusLabel(t, owner.status)} />
        {owner.pumps.length > 0 && (
          <StatusBadge
            tone={allSetUp ? 'ok' : 'warn'}
            icon={allSetUp ? Check : AlertTriangle}
            label={t('owners.setupDone', { done: setUpPumps, total: owner.pumps.length })}
          />
        )}
      </span>
    </Link>
  )
}

/** Owners beside the open owner's pumps on desktop; on smaller screens the list and the owner are two screens. */
export function OwnersList({ owners, ownersLoading }: { owners: OwnerSummary[]; ownersLoading: boolean }) {
  const { t } = useTranslation(['superadmin', 'common'])
  const [searchParams, setSearchParams] = useSearchParams()
  const [ownersPage, setOwnersPage] = useState(0)

  const ownerText = searchParams.get('owner')
  const selectedId = ownerText !== null && /^\d+$/.test(ownerText) ? Number(ownerText) : null
  const selectedOwner = owners.find((owner) => owner.ownerId === selectedId) ?? null

  const totalPages = Math.max(1, Math.ceil(owners.length / ownersPageSize))
  const safePage = Math.min(ownersPage, totalPages - 1)
  const pageOwners = owners.slice(safePage * ownersPageSize, (safePage + 1) * ownersPageSize)

  const closeOwner = () => setSearchParams((params) => {
    const updated = new URLSearchParams(params)
    updated.delete('owner')
    return updated
  })

  const list = ownersLoading ? (
    <div className="px-4 py-3"><SkeletonRows count={5} /></div>
  ) : owners.length === 0 ? (
    <div className="ui-empty m-4">
      <p className="ui-subtitle">{t('owners.empty')}</p>
      <p className="mt-1 text-xs text-ink-3">{t('owners.emptyHint')}</p>
    </div>
  ) : (
    <>
      <ul>
        {pageOwners.map((owner) => (
          <li key={owner.ownerId}>
            <OwnerListItem owner={owner} selected={owner.ownerId === selectedId} />
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <span className="text-xs text-ink-3">{t('common:pagination.pageOf', { page: safePage + 1, total: totalPages })}</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setOwnersPage(safePage - 1)} disabled={safePage === 0}
              className="ui-btn ui-btn-secondary ui-btn-compact disabled:opacity-30">
              {t('common:pagination.prev')}
            </button>
            <button type="button" onClick={() => setOwnersPage(safePage + 1)} disabled={safePage >= totalPages - 1}
              className="ui-btn ui-btn-secondary ui-btn-compact disabled:opacity-30">
              {t('common:pagination.next')}
            </button>
          </div>
        </div>
      )}
    </>
  )

  return (
    <PageSection
      title={t('owners.title')}
      titleMeta={<StatusBadge tone="info" label={t('owners.count', { count: owners.length })} />}
      description={t('owners.subtitle')}
      flush
    >
      <ListDetail
        listLabel={t('owners.listLabel')}
        detailLabel={t('owners.detailLabel')}
        list={list}
        selectedId={selectedId}
        detail={selectedOwner
          ? <OwnerDetail key={selectedOwner.ownerId} owner={selectedOwner} />
          : ownersLoading ? <SkeletonRows count={3} /> : <p className="ui-empty">{t('owners.notFound')}</p>}
        placeholder={<p className="ui-empty">{t('owners.selectOwner')}</p>}
        onBack={closeOwner}
      />
    </PageSection>
  )
}
