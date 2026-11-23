import client from './client'
import type { PagedResponse } from '../types/paged'

export type NotificationType =
  | 'LOW_STOCK'
  | 'PRICE_STALE'
  | 'DOCUMENT_EXPIRING'
  | 'CALIBRATION_DUE'
  | 'CALIBRATION_DUE_SOON'
  | 'SHIFT_OVERDUE'
  | 'ZERO_SALE_SHIFT'
  | 'PRICE_CHANGE_OPEN_SHIFT'
  | 'ANCILLARY_LOW_STOCK'
  | 'AUTO_CLOSED_SHIFT'
  | 'SETTLEMENT_REMINDER'

/** The page a notification opens: an app route and the query parameters that pick what it is about. */
export interface NotificationTarget {
  route: string
  params: Record<string, string>
}

export interface Notification {
  id: number
  pumpId: number
  type: NotificationType
  title: string
  message: string
  createdAt: string
  /** Whether the signed-in user has read it; other users keep their own read state. */
  read: boolean
  target: NotificationTarget
  /** Names title and message in enums.json notifications; null on old notifications, which show title and message as stored. */
  code?: string | null
  /** The values title and message were built from. */
  params?: Record<string, unknown> | null
}

/** The newest notifications the signed-in user has not read (at most 100), and their total unread count. */
export interface NotificationList {
  notifications: Notification[]
  unreadCount: number
}

export const notificationApi = {
  getNotifications: (pumpId: number): Promise<NotificationList> =>
    client.get(`/pumps/${pumpId}/notifications`).then(r => r.data),

  /** Read and unread notifications of the types the user receives, newest first; type narrows to one type. */
  getHistory: (pumpId: number, page: number, size: number, type?: NotificationType): Promise<PagedResponse<Notification>> =>
    client.get(`/pumps/${pumpId}/notifications/history`, { params: { page, size, ...(type && { type }) } }).then(r => r.data),

  /** Marks only the given notifications as read for the signed-in user; other users still see them. */
  markRead: (pumpId: number, ids: number[]): Promise<void> =>
    client.post(`/pumps/${pumpId}/notifications/mark-read`, { ids }).then(r => r.data),
}
