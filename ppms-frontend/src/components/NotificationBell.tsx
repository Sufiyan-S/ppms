import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationApi } from '../api/notificationApi'

interface Props {
  pumpId: number
}

export default function NotificationBell({ pumpId }: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: notifications = [] } = useQuery({
    queryKey:        ['notifications', pumpId],
    queryFn:         () => notificationApi.getNotifications(pumpId),
    refetchInterval: 60_000, // poll every 60 seconds
  })

  const markReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllRead(pumpId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications', pumpId] }),
  })

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = notifications.filter(n => !n.readAt)

  const handleOpen = () => {
    setOpen(s => !s)
  }

  const handleMarkAllRead = () => {
    if (unread.length > 0) markReadMutation.mutate()
  }

  const TYPE_ICONS: Record<string, string> = {
    LOW_STOCK:               '🛢',
    PRICE_STALE:             '⚠️',
    DOCUMENT_EXPIRING:       '📄',
    CALIBRATION_DUE:         '🔧',
    SHIFT_OVERDUE:           '⏰',
    ZERO_SALE_SHIFT:         '🔍',
    PRICE_CHANGE_OPEN_SHIFT: '💰',
    ANCILLARY_LOW_STOCK:     '📦',
    AUTO_CLOSED_SHIFT:       '🔒',
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="ui-notification-bell relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 shadow-sm hover:border-white/20 hover:bg-white/10 hover:text-white"
        title="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="ui-notification-panel absolute right-0 top-12 z-50 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="ui-notification-panel__head flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              <p className="mt-0.5 text-xs text-slate-400">{unread.length} unread</p>
            </div>
            {unread.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markReadMutation.isPending}
                className="ui-btn ui-btn-ghost min-h-8 px-2.5 py-1 text-xs"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">No notifications</p>
              <p className="mt-1 text-xs text-slate-400">You're all caught up</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`ui-notification-panel__item px-4 py-3.5 ${n.readAt ? 'opacity-70' : 'bg-blue-50/50'}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type] ?? '📌'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">{n.message}</p>
                    </div>
                    {!n.readAt && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
