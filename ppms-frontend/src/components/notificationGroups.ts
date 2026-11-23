import type { Notification } from '../api/notificationApi'
import { activeLanguage, hasTranslation, translateKey } from '../i18n'
import { translatedParams } from '../utils/apiError'

/**
 * Title and message in the user's language from enums:notifications.<code>, filled with the notification's params.
 * In English, or for a notification stored without a code, the server's own English text.
 */
export function notificationText(notification: Notification): { title: string; message: string } {
  const key = `enums:notifications.${notification.code}`
  if (activeLanguage() === 'en' || !notification.code || !notification.params || !hasTranslation(`${key}.title`)) {
    return { title: notification.title, message: notification.message }
  }
  const params = translatedParams(notification.params)
  return { title: translateKey(`${key}.title`, params), message: translateKey(`${key}.message`, params) }
}

export interface NotificationGroup {
  latest: Notification
  count: number
  /** Every notification in the group, so opening the group marks all of them read. */
  ids: number[]
}

/** Collapses notifications with the same type, title and message into one entry, keeping the newest first. */
export function groupIdenticalNotifications(notifications: Notification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>()
  for (const notification of notifications) {
    const key = JSON.stringify([notification.type, notification.title, notification.message])
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { latest: notification, count: 1, ids: [notification.id] })
      continue
    }
    group.count += 1
    group.ids.push(notification.id)
    if (notification.createdAt > group.latest.createdAt) group.latest = notification
  }
  return [...groups.values()]
}
