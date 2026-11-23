import type { ApprovalItem } from '../../api/approvalApi'
import { translateKey } from '../../i18n'

export function approvalKey(item: Pick<ApprovalItem, 'kind' | 'id'>) {
  return `${item.kind}-${item.id}`
}

/** How long an item has waited, in the largest whole unit: "3 days", "5 hours", "just now". */
export function waitingFor(submittedAt: string | null, now: number): string {
  if (!submittedAt) return '—'
  const minutes = Math.floor((now - new Date(submittedAt).getTime()) / 60_000)
  if (minutes < 60) return minutes < 1 ? translateKey('approvals:waiting.justNow') : translateKey('approvals:waiting.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return translateKey('approvals:waiting.hours', { count: hours })
  const days = Math.floor(hours / 24)
  return translateKey('approvals:waiting.days', { count: days })
}
