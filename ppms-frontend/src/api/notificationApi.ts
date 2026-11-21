import client from './client'

export type NotificationType =
  | 'LOW_STOCK'
  | 'PRICE_STALE'
  | 'DOCUMENT_EXPIRING'
  | 'CALIBRATION_DUE'
  | 'SHIFT_OVERDUE'
  | 'ZERO_SALE_SHIFT'
  | 'PRICE_CHANGE_OPEN_SHIFT'
  | 'ANCILLARY_LOW_STOCK'
  | 'AUTO_CLOSED_SHIFT'
  | 'SETTLEMENT_REMINDER'

export interface Notification {
  id: number
  pumpId: number
  type: NotificationType
  title: string
  message: string
  dedupKey: string
  readAt: string | null
  createdAt: string
}

/** The newest unread notifications (at most 100) and the total number unread. */
export interface NotificationList {
  notifications: Notification[]
  unreadCount: number
}

export const notificationApi = {
  getNotifications: (pumpId: number): Promise<NotificationList> =>
    client.get(`/pumps/${pumpId}/notifications`).then(r => r.data),

  /** Marks only the given notifications as read, so unread alerts that were not shown stay unread. */
  markRead: (pumpId: number, ids: number[]): Promise<void> =>
    client.post(`/pumps/${pumpId}/notifications/mark-read`, { ids }).then(r => r.data),
}
