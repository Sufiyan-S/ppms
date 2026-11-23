import { useState, useRef, useEffect, useId } from 'react'
import { Link } from 'react-router-dom'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useNow } from '../hooks/useNow'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { notificationApi } from '../api/notificationApi'
import { useAuthStore } from '../store/authStore'
import { formatIstDateTime, withReadableDates } from '../utils/date'
import { relativeTime } from '../utils/relativeTime'
import { groupIdenticalNotifications, notificationText } from './notificationGroups'
import { openableHref } from './notificationLinks'
import { NotificationTypeIcon } from './NotificationTypeIcon'

interface Props {
  pumpId: number
}

export default function NotificationBell({ pumpId }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const role = useAuthStore((state) => state.user?.role)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const now = useNow(60_000)

  const { data } = useQuery({
    queryKey:        ['notifications', pumpId],
    queryFn:         () => notificationApi.getNotifications(pumpId),
    refetchInterval: 60_000, // poll every 60 seconds
  })
  const notifications = data?.notifications ?? []
  const unreadCount   = data?.unreadCount ?? 0
  const groups        = groupIdenticalNotifications(notifications)

  // Each rise in the unread count (not the first load, nor a pump switch) remounts the icon and badge to replay their animation.
  const [lastSeenUnread, setLastSeenUnread] = useState<{ pumpId: number; count: number } | null>(null)
  const [ringCount, setRingCount] = useState(0)
  if (data && (lastSeenUnread?.pumpId !== pumpId || lastSeenUnread.count !== unreadCount)) {
    if (lastSeenUnread?.pumpId === pumpId && unreadCount > lastSeenUnread.count) setRingCount(ringCount + 1)
    setLastSeenUnread({ pumpId, count: unreadCount })
  }

  const markReadMutation = useMutation({
    mutationFn: (ids: number[]) => notificationApi.markRead(pumpId, ids),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['notifications', pumpId] })
      qc.invalidateQueries({ queryKey: ['notification-history', pumpId] })
    },
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEscapeKey(() => {
    setOpen(false)
    bellRef.current?.focus()
  }, open)

  const handleOpen = () => {
    setOpen(s => !s)
  }

  const handleMarkShownRead = () => {
    if (notifications.length > 0) markReadMutation.mutate(notifications.map(n => n.id))
  }

  const openNotification = (ids: number[]) => {
    markReadMutation.mutate(ids)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? t('notifications.bellUnread', { count: unreadCount }) : t('notifications.title')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="ui-notification-bell relative inline-flex h-10 w-10 items-center justify-center rounded-card border border-white/10 bg-white/5 text-on-dark-2 shadow-sm hover:border-white/20 hover:bg-white/10 hover:text-white"
      >
        <span key={`icon-${ringCount}`} className={`inline-flex ${ringCount > 0 ? 'ui-notification-bell__icon--ring' : ''}`}>
          <Bell size={18} strokeWidth={1.75} />
        </span>
        {unreadCount > 0 && (
          <span key={`badge-${ringCount}`} className={`absolute -top-0.5 -right-0.5 w-4 h-4 bg-bad text-white text-xs font-bold rounded-full flex items-center justify-center leading-none ${ringCount > 0 ? 'ui-notification-bell__badge--pop' : ''}`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div id={panelId} role="region" aria-label={t('notifications.title')} className="ui-notification-panel absolute right-0 top-12 z-50 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-surface shadow-2xl">
          <div className="ui-notification-panel__head flex items-center justify-between border-b border-border px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold text-ink">{t('notifications.title')}</p>
              <p className="mt-0.5 text-xs text-ink-3">
                {t('notifications.unreadCount', { count: unreadCount })}{unreadCount > notifications.length ? t('notifications.showingNewest', { count: notifications.length }) : ''}
              </p>
            </div>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkShownRead}
                disabled={markReadMutation.isPending}
                className="ui-btn ui-btn-ghost min-h-8 px-2.5 py-1 text-xs"
              >
                {unreadCount > notifications.length ? t('notifications.markShownRead') : t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-ink-3">{t('notifications.empty')}</p>
              <p className="mt-1 text-xs text-ink-3">{t('notifications.allCaughtUp')}</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-border">
              {groups.map(({ latest: n, count, ids }) => {
                const href = openableHref(n.target, role)
                const text = notificationText(n)
                const body = (
                  <div className="flex items-start gap-2">
                    <NotificationTypeIcon type={n.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        <span className="sr-only">{t('notifications.unreadPrefix')}</span>{text.title}
                        {count > 1 && (
                          <span className="ml-1.5 rounded-badge bg-surface-sunken px-1.5 py-0.5 text-xs font-medium text-ink-2">
                            <span aria-hidden="true">×{count}</span>
                            <span className="sr-only">{t('notifications.identicalAlerts', { count })}</span>
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-3">{withReadableDates(text.message)}</p>
                      <time dateTime={n.createdAt} title={formatIstDateTime(n.createdAt)} className="mt-1 block text-xs text-ink-3">
                        {relativeTime(n.createdAt, new Date(now))}
                      </time>
                    </div>
                    <span aria-hidden="true" className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />
                  </div>
                )
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link
                        to={href}
                        onClick={() => openNotification(ids)}
                        className="ui-notification-panel__item block px-4 py-3.5 bg-info-bg"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="ui-notification-panel__item px-4 py-3.5 bg-info-bg">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <div className="border-t border-border px-4 py-2.5 text-center">
            <Link to="/dashboard/notifications" onClick={() => setOpen(false)} className="ui-link text-sm">
              {t('notifications.viewAll')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
