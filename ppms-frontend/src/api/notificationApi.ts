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

export const notificationApi = {
  getNotifications: (pumpId: number): Promise<Notification[]> =>
    client.get(`/pumps/${pumpId}/notifications`).then(r => r.data),

  markAllRead: (pumpId: number): Promise<void> =>
    client.post(`/pumps/${pumpId}/notifications/mark-all-read`).then(r => r.data),
}
