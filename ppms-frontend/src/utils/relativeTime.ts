import { formatTimeAgo } from '../i18n/format'
import { formatIstDate } from './date'

/** "just now", "5m ago", "2h ago", "3d ago", then the date ("12 Nov") after a week. */
export function relativeTime(isoInstant: string, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(isoInstant).getTime()
  return formatTimeAgo(elapsed) ?? formatIstDate(isoInstant, { day: 'numeric', month: 'short' })
}
