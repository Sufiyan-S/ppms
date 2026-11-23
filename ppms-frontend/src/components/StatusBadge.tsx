import type { LucideIcon } from 'lucide-react'

export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral'

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-info-bg text-info',
  neutral: 'bg-neutral-bg text-neutral',
}

interface StatusBadgeProps {
  tone: StatusTone
  label: string
  icon?: LucideIcon
  /** Lets a long label, such as a rejection note, wrap onto more lines. */
  wrap?: boolean
  className?: string
}

/** A status shown as icon + word on a tinted background, so it never depends on colour alone. */
export function StatusBadge({ tone, label, icon: Icon, wrap = false, className = '' }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 ${wrap ? '' : 'whitespace-nowrap'} rounded-badge px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]} ${className}`}>
      {Icon && <Icon size={14} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />}
      {label}
    </span>
  )
}
