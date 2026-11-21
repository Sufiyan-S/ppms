import { useState, useRef, useEffect, useId } from 'react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell, Droplets, AlertTriangle, FileText, Wrench,
  Clock, TrendingDown, IndianRupee, Package, Lock, Info,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { notificationApi } from '../api/notificationApi'
import { withReadableDates } from '../utils/date'

interface Props {
  pumpId: number
}

export default function NotificationBell({ pumpId }: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const { data } = useQuery({
    queryKey:        ['notifications', pumpId],
    queryFn:         () => notificationApi.getNotifications(pumpId),
    refetchInterval: 60_000, // poll every 60 seconds
  })
  const notifications = data?.notifications ?? []
  const unreadCount   = data?.unreadCount ?? 0

  const markReadMutation = useMutation({
    mutationFn: (ids: number[]) => notificationApi.markRead(pumpId, ids),
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

  useEscapeKey(() => {
    setOpen(false)
    bellRef.current?.focus()
  }, open)

  const handleOpen = () => {
    setOpen(s => !s)
  }

  const handleMarkShownRead = () => {
    if (unread.length > 0) markReadMutation.mutate(unread.map(n => n.id))
  }

  function TypeIcon({ type }: { type: string }) {
    const base: LucideProps = { size: 15, strokeWidth: 1.75 }
    switch (type) {
      case 'LOW_STOCK':               return <Droplets      {...base} className="text-orange-400 flex-shrink-0 mt-0.5" />
      case 'PRICE_STALE':             return <AlertTriangle {...base} className="text-amber-400  flex-shrink-0 mt-0.5" />
      case 'DOCUMENT_EXPIRING':       return <FileText      {...base} className="text-slate-500  flex-shrink-0 mt-0.5" />
      case 'CALIBRATION_DUE':         return <Wrench        {...base} className="text-slate-500  flex-shrink-0 mt-0.5" />
      case 'SHIFT_OVERDUE':           return <Clock         {...base} className="text-red-400    flex-shrink-0 mt-0.5" />
      case 'ZERO_SALE_SHIFT':         return <TrendingDown  {...base} className="text-slate-500  flex-shrink-0 mt-0.5" />
      case 'PRICE_CHANGE_OPEN_SHIFT': return <IndianRupee   {...base} className="text-blue-400   flex-shrink-0 mt-0.5" />
      case 'ANCILLARY_LOW_STOCK':     return <Package       {...base} className="text-slate-500  flex-shrink-0 mt-0.5" />
      case 'AUTO_CLOSED_SHIFT':       return <Lock          {...base} className="text-slate-500  flex-shrink-0 mt-0.5" />
      default:                        return <Info          {...base} className="text-slate-500  flex-shrink-0 mt-0.5" />
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        ref={bellRef}
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="ui-notification-bell relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 shadow-sm hover:border-white/20 hover:bg-white/10 hover:text-white"
      >
        <Bell size={18} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div id={panelId} role="region" aria-label="Notifications" className="ui-notification-panel absolute right-0 top-12 z-50 w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="ui-notification-panel__head flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <div>
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {unreadCount} unread{unreadCount > notifications.length ? ` · showing newest ${notifications.length}` : ''}
              </p>
            </div>
            {unread.length > 0 && (
              <button
                onClick={handleMarkShownRead}
                disabled={markReadMutation.isPending}
                className="ui-btn ui-btn-ghost min-h-8 px-2.5 py-1 text-xs"
              >
                {unreadCount > unread.length ? 'Mark shown read' : 'Mark all read'}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">No notifications</p>
              <p className="mt-1 text-xs text-slate-500">You're all caught up</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`ui-notification-panel__item px-4 py-3.5 ${n.readAt ? 'opacity-70' : 'bg-blue-50/50'}`}
                >
                  <div className="flex items-start gap-2">
                    <TypeIcon type={n.type} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{!n.readAt && <span className="sr-only">Unread: </span>}{n.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-500">{withReadableDates(n.message)}</p>
                    </div>
                    {!n.readAt && (
                      <span aria-hidden="true" className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
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
