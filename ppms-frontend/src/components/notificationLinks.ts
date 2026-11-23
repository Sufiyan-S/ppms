import type { NotificationTarget, NotificationType } from '../api/notificationApi'
import { canAccessPath } from '../permissions/permissions'
import type { UserRole } from '../types/auth'
import { translateKey } from '../i18n'

/** The address a notification opens, e.g. /dashboard/shifts?shift=123. */
export function notificationHref(target: NotificationTarget): string {
  const query = new URLSearchParams(target.params).toString()
  return query ? `${target.route}?${query}` : target.route
}

/** The address to open, or null when the user's role cannot open that page, so the alert is shown without a link. */
export function openableHref(target: NotificationTarget, role: UserRole | undefined): string | null {
  return canAccessPath(target.route, role) ? notificationHref(target) : null
}

export const NOTIFICATION_TYPES: NotificationType[] = [
  'LOW_STOCK',
  'PRICE_STALE',
  'DOCUMENT_EXPIRING',
  'CALIBRATION_DUE',
  'CALIBRATION_DUE_SOON',
  'SHIFT_OVERDUE',
  'ZERO_SALE_SHIFT',
  'PRICE_CHANGE_OPEN_SHIFT',
  'ANCILLARY_LOW_STOCK',
  'AUTO_CLOSED_SHIFT',
  'SETTLEMENT_REMINDER',
]

/** The type's name in the active language (notifications.json types.<TYPE>); the raw code when the type is new. */
export function notificationTypeLabel(type: NotificationType): string {
  return translateKey(`notifications:types.${type}`, { defaultValue: type })
}
