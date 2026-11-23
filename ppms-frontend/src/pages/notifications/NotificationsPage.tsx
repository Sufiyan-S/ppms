import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationApi } from '../../api/notificationApi'
import type { Notification, NotificationType } from '../../api/notificationApi'
import { Pagination } from '../../components/Pagination'
import { SkeletonRows } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { NotificationTypeIcon } from '../../components/NotificationTypeIcon'
import { NOTIFICATION_TYPES, notificationTypeLabel, openableHref } from '../../components/notificationLinks'
import { notificationText } from '../../components/notificationGroups'
import { useNow } from '../../hooks/useNow'
import { useAuthStore } from '../../store/authStore'
import { usePumpStore } from '../../store/usePumpStore'
import { parseApiError } from '../../utils/apiError'
import { formatIstDateTime, withReadableDates } from '../../utils/date'
import { relativeTime } from '../../utils/relativeTime'
import { FilterBar } from '../../components/layout/FilterBar'
import { Page } from '../../components/layout/Page'
import { PageHeader } from '../../components/layout/PageHeader'
import { PageSection } from '../../components/layout/PageSection'

function NotificationRow({ notification, now, onOpen }: { notification: Notification; now: number; onOpen: (id: number) => void }) {
  const { t } = useTranslation(['notifications', 'common'])
  const role = useAuthStore((state) => state.user?.role)
  const href = openableHref(notification.target, role)
  const { title, message } = notificationText(notification)
  const body = (
    <div className="flex items-start gap-3">
      <NotificationTypeIcon type={notification.type} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${notification.read ? 'font-medium text-ink-2' : 'font-semibold text-ink'}`}>
          {title}
        </p>
        <p className="mt-1 text-sm text-ink-3">{withReadableDates(message)}</p>
        <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-ink-3">
          <time dateTime={notification.createdAt} title={formatIstDateTime(notification.createdAt)}>
            {relativeTime(notification.createdAt, new Date(now))}
          </time>
          <span aria-hidden="true">·</span>
          <span>{notificationTypeLabel(notification.type)}</span>
        </p>
      </div>
      <StatusBadge tone={notification.read ? 'neutral' : 'info'} label={notification.read ? t('common:notifications.read') : t('common:notifications.unread')} className="flex-shrink-0" />
    </div>
  )
  return (
    <li>
      {href ? (
        <Link to={href} onClick={() => { if (!notification.read) onOpen(notification.id) }} className="block px-5 py-4 hover:bg-bg">
          {body}
        </Link>
      ) : (
        <div className="px-5 py-4">{body}</div>
      )}
    </li>
  )
}

type ReadFilter = 'all' | 'unread'

function typeParam(value: string | null): NotificationType | '' {
  return NOTIFICATION_TYPES.find((type) => type === value) ?? ''
}

/** Filters live in the address (?type=LOW_STOCK&status=unread), so a refresh or a shared link keeps them. */
export default function NotificationsPage() {
  const { t, i18n } = useTranslation(['notifications', 'common'])
  const { selectedPumpId: pumpId } = usePumpStore()
  const qc = useQueryClient()
  const now = useNow(60_000)
  const [searchParams, setSearchParams] = useSearchParams()
  const type = typeParam(searchParams.get('type'))
  const readFilter: ReadFilter = searchParams.get('status') === 'unread' ? 'unread' : 'all'
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  const history = useQuery({
    queryKey: ['notification-history', pumpId, type, page, pageSize],
    queryFn: () => notificationApi.getHistory(pumpId!, page, pageSize, type || undefined),
    enabled: !!pumpId && readFilter === 'all',
    placeholderData: keepPreviousData,
  })

  const unread = useQuery({
    queryKey: ['notifications', pumpId],
    queryFn: () => notificationApi.getNotifications(pumpId!),
    enabled: !!pumpId,
  })

  const markRead = useMutation({
    mutationFn: (id: number) => notificationApi.markRead(pumpId!, [id]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', pumpId] })
      qc.invalidateQueries({ queryKey: ['notification-history', pumpId] })
    },
  })

  const typeOptions = NOTIFICATION_TYPES
    .map((value) => [value, notificationTypeLabel(value)] as const)
    .sort(([, a], [, b]) => a.localeCompare(b, i18n.language))

  const updateFilter = (name: 'type' | 'status', value: string) => {
    setPage(0)
    setSearchParams((params) => {
      const updated = new URLSearchParams(params)
      if (value) updated.set(name, value)
      else updated.delete(name)
      return updated
    }, { replace: true })
  }

  const clearFilters = () => {
    setPage(0)
    setSearchParams((params) => {
      const updated = new URLSearchParams(params)
      updated.delete('type')
      updated.delete('status')
      return updated
    }, { replace: true })
  }

  if (!pumpId) {
    return (
      <Page>
        <PageHeader title={t('page.title')} />
        <div className="ui-empty">{t('page.noPump')}</div>
      </Page>
    )
  }

  const unreadCount = unread.data?.unreadCount ?? 0
  const unreadShown = (unread.data?.notifications ?? []).filter((notification) => !type || notification.type === type)
  const isLoading = readFilter === 'unread' ? unread.isLoading : history.isLoading
  const error = readFilter === 'unread' ? unread.error : history.error
  const notifications = readFilter === 'unread' ? unreadShown : history.data?.content ?? []
  const summary = readFilter === 'unread'
    ? t('page.unreadSummary', { count: unreadShown.length })
    : t('page.allCount', { total: history.data?.totalElements ?? '…' })

  return (
    <Page>
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        badges={unreadCount > 0 && <StatusBadge tone="info" label={t('common:notifications.unreadCount', { count: unreadCount })} />}
      />

      <PageSection title={t('page.listTitle')} flush>
        <FilterBar
          label={t('page.filtersLabel')}
          hasActiveFilters={!!type || readFilter !== 'all'}
          onClearFilters={clearFilters}
          summary={summary}
        >
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-3">{t('page.typeFilter')}</span>
            <select value={type} onChange={(e) => updateFilter('type', e.target.value)} className="text-sm">
              <option value="">{t('page.allTypes')}</option>
              {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="ui-chip-row" role="group" aria-label={t('page.readFilter')}>
            <button type="button" className="ui-chip" aria-pressed={readFilter === 'all'} onClick={() => updateFilter('status', '')}>
              {t('page.readFilterAll')}
            </button>
            <button type="button" className="ui-chip" aria-pressed={readFilter === 'unread'} onClick={() => updateFilter('status', 'unread')}>
              {t('common:notifications.unread')}
            </button>
          </div>
        </FilterBar>

        {isLoading ? (
          <div className="px-5 py-4"><SkeletonRows count={5} /></div>
        ) : error ? (
          <p role="alert" className="ui-alert ui-alert-danger m-4 text-sm">{parseApiError(error, t('page.loadFailed'))}</p>
        ) : notifications.length === 0 ? (
          <p className="ui-empty m-4">
            {readFilter === 'unread' ? t('page.emptyUnread') : type ? t('page.emptyForType') : t('page.empty')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} now={now} onOpen={(id) => markRead.mutate(id)} />
            ))}
          </ul>
        )}

        {readFilter === 'unread' && unreadCount > (unread.data?.notifications.length ?? 0) && (
          <p className="px-5 pb-4 text-xs text-ink-3">{t('page.unreadLimit', { count: unread.data?.notifications.length ?? 0 })}</p>
        )}

        {readFilter === 'all' && history.data && history.data.totalElements > 0 && (
          <div className="px-5 pb-4">
            <Pagination
              data={history.data}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(0) }}
              pageSizeOptions={[20, 50, 100]}
            />
          </div>
        )}
      </PageSection>
    </Page>
  )
}
